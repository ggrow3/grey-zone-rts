using GreyZone.Server.Data;
using GreyZone.Server.Hubs;
using GreyZone.Server.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace GreyZone.Server.Matches;

/// <summary>
/// Singleton owning the matchmaking queue, all in-memory matches and their 100 ms turn loops.
/// The server never simulates the game; it only orders commands into turns and records results.
/// </summary>
public sealed class MatchService(
    IHubContext<GameHub> hub,
    IServiceScopeFactory scopes,
    ILogger<MatchService> log)
{
    public static readonly TimeSpan TurnInterval = TimeSpan.FromMilliseconds(100);
    public static readonly TimeSpan GracePeriod = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan JoinTimeout = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan Retention = TimeSpan.FromMinutes(10);

    private sealed record QueueEntry(string ConnectionId, string UserId, string Username, int SidePref);
    private sealed record Outgoing(string ConnectionId, string Event, object Payload);

    private readonly object _lock = new();
    private readonly Dictionary<string, Match> _matches = new();
    private readonly Dictionary<string, string> _activeMatchByUser = new();
    private readonly List<QueueEntry> _queue = new();

    /// <summary>Raised after a match has ended and its result has been persisted (used to refresh the lobby).</summary>
    public event Func<Task>? MatchFinished;

    public int QueueCount
    {
        get { lock (_lock) return _queue.Count; }
    }

    // ------------------------------------------------------------------ queue

    public async Task JoinQueueAsync(string connectionId, string userId, string username, int sidePref)
    {
        if (sidePref is < -1 or > 1)
        {
            sidePref = -1;
        }

        var outbox = new List<Outgoing>();
        lock (_lock)
        {
            if (_activeMatchByUser.TryGetValue(userId, out var activeId))
            {
                outbox.Add(new Outgoing(connectionId, "Error", new ErrorDto($"You are already in a match ({activeId}). Leave it before queueing.")));
            }
            else
            {
                // A user has at most one queue entry; the newest connection wins.
                _queue.RemoveAll(q => q.UserId == userId);
                _queue.Add(new QueueEntry(connectionId, userId, username, sidePref));

                while (TryPairLocked(outbox))
                {
                }

                QueueStatusesLocked(outbox);
            }
        }

        await FlushAsync(outbox);
    }

    public async Task LeaveQueueAsync(string connectionId)
    {
        var outbox = new List<Outgoing>();
        lock (_lock)
        {
            if (_queue.RemoveAll(q => q.ConnectionId == connectionId) > 0)
            {
                QueueStatusesLocked(outbox);
            }

            outbox.Add(new Outgoing(connectionId, "QueueStatus", new QueueStatusDto(false, 0)));
        }

        await FlushAsync(outbox);
    }

    private static bool Compatible(int a, int b) => a == -1 || b == -1 || a != b;

    /// <summary>Pairs the two longest-waiting compatible players. Caller holds <see cref="_lock"/>.</summary>
    private bool TryPairLocked(List<Outgoing> outbox)
    {
        for (var i = 0; i < _queue.Count; i++)
        {
            for (var j = i + 1; j < _queue.Count; j++)
            {
                if (!Compatible(_queue[i].SidePref, _queue[j].SidePref))
                {
                    continue;
                }

                var a = _queue[i];
                var b = _queue[j];
                _queue.RemoveAt(j);
                _queue.RemoveAt(i);

                int teamA, teamB;
                if (a.SidePref != -1)
                {
                    teamA = a.SidePref;
                    teamB = 1 - teamA;
                }
                else if (b.SidePref != -1)
                {
                    teamB = b.SidePref;
                    teamA = 1 - teamB;
                }
                else
                {
                    teamA = Random.Shared.Next(2);
                    teamB = 1 - teamA;
                }

                var match = new Match
                {
                    Seed = Random.Shared.Next(),
                    Players =
                    [
                        new MatchPlayer(a.UserId, a.Username, teamA) { ConnectionId = a.ConnectionId },
                        new MatchPlayer(b.UserId, b.Username, teamB) { ConnectionId = b.ConnectionId },
                    ],
                };

                _matches[match.Id] = match;
                _activeMatchByUser[a.UserId] = match.Id;
                _activeMatchByUser[b.UserId] = match.Id;

                lock (match.Sync)
                {
                    outbox.Add(new Outgoing(a.ConnectionId, "MatchFound", match.ToInfo(teamA)));
                    outbox.Add(new Outgoing(b.ConnectionId, "MatchFound", match.ToInfo(teamB)));
                }

                StartJoinTimeout(match);
                log.LogInformation("Match {MatchId} created: {A} (team {TeamA}) vs {B} (team {TeamB}), seed {Seed}",
                    match.Id, a.Username, teamA, b.Username, teamB, match.Seed);
                return true;
            }
        }

        return false;
    }

    /// <summary>Queues a QueueStatus for everyone still waiting. Caller holds <see cref="_lock"/>.</summary>
    private void QueueStatusesLocked(List<Outgoing> outbox)
    {
        for (var i = 0; i < _queue.Count; i++)
        {
            outbox.Add(new Outgoing(_queue[i].ConnectionId, "QueueStatus", new QueueStatusDto(true, i + 1)));
        }
    }

    private async Task FlushAsync(List<Outgoing> outbox)
    {
        foreach (var message in outbox)
        {
            try
            {
                await hub.Clients.Client(message.ConnectionId).SendAsync(message.Event, message.Payload);
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Failed to send {Event} to connection {ConnectionId}", message.Event, message.ConnectionId);
            }
        }
    }

    // ---------------------------------------------------------------- matches

    private Match? Find(string matchId)
    {
        lock (_lock)
        {
            return _matches.GetValueOrDefault(matchId);
        }
    }

    public async Task<MatchInfo> JoinMatchAsync(string matchId, string connectionId, string userId)
    {
        var match = Find(matchId) ?? throw new HubException("Match not found.");

        MatchInfo info;
        MatchPlayer player;
        MatchPlayer opponent;
        string? previousConnection = null;
        var startLoop = false;
        var resumed = false;
        MatchEndedDto? alreadyEnded = null;
        int? opponentGraceLeft = null;

        lock (match.Sync)
        {
            player = match.PlayerByUser(userId) ?? throw new HubException("You are not a player in this match.");
            opponent = match.Opponent(player);

            if (player.ConnectionId != connectionId)
            {
                previousConnection = player.ConnectionId;
                player.ConnectionId = connectionId;
            }

            player.Joined = true;
            player.Connected = true;
            CancelGrace(player);

            switch (match.State)
            {
                case MatchState.WaitingForPlayers when opponent.Joined && opponent.Connected:
                    match.State = MatchState.Running;
                    match.StartedAt = DateTime.UtcNow;
                    match.JoinTimeoutCts.Cancel();
                    startLoop = true;
                    break;

                case MatchState.Paused when opponent.Connected:
                    match.State = MatchState.Running;
                    resumed = true;
                    break;

                case MatchState.Ended:
                    alreadyEnded = match.Result;
                    break;
            }

            if (match.State != MatchState.Ended && !opponent.Connected && opponent.GraceDeadline is { } deadline)
            {
                opponentGraceLeft = Math.Max(0, (int)Math.Ceiling((deadline - DateTime.UtcNow).TotalSeconds));
            }

            info = match.ToInfo(player.Team);
        }

        if (previousConnection is not null)
        {
            await hub.Groups.RemoveFromGroupAsync(previousConnection, match.GroupName);
        }

        await hub.Groups.AddToGroupAsync(connectionId, match.GroupName);

        if (startLoop)
        {
            match.LoopTask = Task.Run(() => RunLoopAsync(match));
            log.LogInformation("Match {MatchId} running", match.Id);
        }

        if (resumed && opponent.ConnectionId is not null)
        {
            await hub.Clients.Client(opponent.ConnectionId)
                .SendAsync("OpponentConnection", new OpponentConnectionDto(true, 0));
            log.LogInformation("Match {MatchId} resumed", match.Id);
        }

        if (opponentGraceLeft is { } seconds)
        {
            await hub.Clients.Client(connectionId)
                .SendAsync("OpponentConnection", new OpponentConnectionDto(false, seconds));
        }

        if (alreadyEnded is not null)
        {
            await hub.Clients.Client(connectionId).SendAsync("MatchEnded", alreadyEnded);
        }

        return info;
    }

    public void SendCommand(string matchId, string userId, string payload)
    {
        if (payload is null)
        {
            return;
        }

        var match = Find(matchId);
        if (match is null)
        {
            return;
        }

        lock (match.Sync)
        {
            var player = match.PlayerByUser(userId);
            if (player is null || match.State != MatchState.Running)
            {
                return;
            }

            match.Pending.Add(new CommandDto(player.Team, payload));
        }
    }

    public async Task SendMatchChatAsync(string matchId, string userId, string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var match = Find(matchId);
        if (match is null)
        {
            return;
        }

        MatchPlayer? player;
        lock (match.Sync)
        {
            player = match.PlayerByUser(userId);
        }

        if (player is null)
        {
            return;
        }

        await hub.Clients.Group(match.GroupName)
            .SendAsync("MatchChat", new MatchChatDto(player.Username, player.Team, text, TimeFormat.Now()));
    }

    public async Task ReportHashAsync(string matchId, string userId, int turn, string hash)
    {
        var match = Find(matchId);
        if (match is null || hash is null)
        {
            return;
        }

        var desync = false;
        lock (match.Sync)
        {
            var player = match.PlayerByUser(userId);
            if (player is null || match.State == MatchState.Ended)
            {
                return;
            }

            player.Hashes[turn] = hash;
            if (player.Hashes.Count > 512)
            {
                foreach (var stale in player.Hashes.Keys.Where(k => k < turn - 256).ToList())
                {
                    player.Hashes.Remove(stale);
                }
            }

            var opponent = match.Opponent(player);
            if (opponent.Hashes.TryGetValue(turn, out var other) && other != hash && match.LastDesyncTurn != turn)
            {
                match.LastDesyncTurn = turn;
                desync = true;
            }
        }

        if (desync)
        {
            log.LogWarning("Match {MatchId} desync at turn {Turn}", match.Id, turn);
            await hub.Clients.Group(match.GroupName).SendAsync("Desync", new DesyncDto(turn));
        }
    }

    public async Task ReportResultAsync(string matchId, string userId, int winnerTeam)
    {
        if (winnerTeam is not (0 or 1))
        {
            return;
        }

        var match = Find(matchId);
        if (match is null)
        {
            return;
        }

        lock (match.Sync)
        {
            if (match.PlayerByUser(userId) is null || match.State == MatchState.Ended)
            {
                return;
            }
        }

        await EndMatchAsync(match, winnerTeam, "hq");
    }

    public async Task LeaveMatchAsync(string matchId, string userId)
    {
        var match = Find(matchId);
        if (match is null)
        {
            return;
        }

        int winnerTeam;
        lock (match.Sync)
        {
            var player = match.PlayerByUser(userId);
            if (player is null || match.State == MatchState.Ended)
            {
                return;
            }

            winnerTeam = match.Opponent(player).Team;
        }

        await EndMatchAsync(match, winnerTeam, "forfeit");
    }

    public async Task OnDisconnectedAsync(string connectionId, string userId)
    {
        var outbox = new List<Outgoing>();
        string? activeMatchId;
        lock (_lock)
        {
            if (_queue.RemoveAll(q => q.ConnectionId == connectionId) > 0)
            {
                QueueStatusesLocked(outbox);
            }

            _activeMatchByUser.TryGetValue(userId, out activeMatchId);
        }

        await FlushAsync(outbox);

        if (activeMatchId is null)
        {
            return;
        }

        var match = Find(activeMatchId);
        if (match is null)
        {
            return;
        }

        MatchPlayer? opponent = null;
        var paused = false;
        lock (match.Sync)
        {
            var player = match.PlayerByUser(userId);
            // Ignore stale connections: a newer connection of the same user already took over.
            if (player is null || player.ConnectionId != connectionId || match.State == MatchState.Ended)
            {
                return;
            }

            player.Connected = false;

            if (match.State is MatchState.Running or MatchState.Paused)
            {
                match.State = MatchState.Paused;
                StartGraceLocked(match, player);
                opponent = match.Opponent(player);
                paused = true;
            }
            // WaitingForPlayers: the join timeout started at MatchFound still applies.
        }

        if (paused && opponent is { Connected: true, ConnectionId: not null })
        {
            log.LogInformation("Match {MatchId} paused: {User} disconnected", match.Id, userId);
            await hub.Clients.Client(opponent.ConnectionId)
                .SendAsync("OpponentConnection", new OpponentConnectionDto(false, (int)GracePeriod.TotalSeconds));
        }
    }

    // -------------------------------------------------------------- lifecycle

    private async Task RunLoopAsync(Match match)
    {
        var ct = match.LoopCts.Token;
        try
        {
            using var timer = new PeriodicTimer(TurnInterval);
            while (await timer.WaitForNextTickAsync(ct))
            {
                TurnDto turn;
                lock (match.Sync)
                {
                    if (match.State != MatchState.Running)
                    {
                        continue; // paused: do not advance the clock
                    }

                    var commands = match.Pending;
                    match.Pending = new List<CommandDto>();
                    match.Turn++;
                    turn = new TurnDto(match.Turn, commands);
                    match.History.Add(turn);
                }

                await hub.Clients.Group(match.GroupName).SendAsync("Turn", turn, ct);
            }
        }
        catch (OperationCanceledException)
        {
            // match ended
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Turn loop for match {MatchId} crashed", match.Id);
        }
    }

    private void StartJoinTimeout(Match match)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(JoinTimeout, match.JoinTimeoutCts.Token);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            bool cancel;
            lock (match.Sync)
            {
                cancel = match.State == MatchState.WaitingForPlayers;
            }

            if (cancel)
            {
                log.LogInformation("Match {MatchId} cancelled: players did not join in time", match.Id);
                await EndMatchAsync(match, -1, "timeout");
            }
        });
    }

    /// <summary>Caller holds <c>match.Sync</c>.</summary>
    private void StartGraceLocked(Match match, MatchPlayer player)
    {
        CancelGrace(player);
        var cts = new CancellationTokenSource();
        player.GraceCts = cts;
        player.GraceDeadline = DateTime.UtcNow + GracePeriod;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(GracePeriod, cts.Token);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            bool expire;
            int winnerTeam;
            lock (match.Sync)
            {
                expire = !player.Connected && match.State != MatchState.Ended;
                winnerTeam = match.Opponent(player).Team;
            }

            if (expire)
            {
                log.LogInformation("Match {MatchId}: {User} did not reconnect within the grace period", match.Id, player.Username);
                await EndMatchAsync(match, winnerTeam, "disconnect");
            }
        });
    }

    private static void CancelGrace(MatchPlayer player)
    {
        player.GraceCts?.Cancel();
        player.GraceCts?.Dispose();
        player.GraceCts = null;
        player.GraceDeadline = null;
    }

    private async Task EndMatchAsync(Match match, int winnerTeam, string reason)
    {
        MatchEndedDto result;
        MatchPlayer? winner;
        lock (match.Sync)
        {
            if (match.State == MatchState.Ended)
            {
                return; // idempotent
            }

            match.State = MatchState.Ended;
            match.EndedAt = DateTime.UtcNow;
            winner = winnerTeam >= 0 ? match.PlayerByTeam(winnerTeam) : null;
            result = new MatchEndedDto(winnerTeam, reason, winner?.Username);
            match.Result = result;

            match.LoopCts.Cancel();
            match.JoinTimeoutCts.Cancel();
            foreach (var p in match.Players)
            {
                CancelGrace(p);
            }
        }

        lock (_lock)
        {
            foreach (var p in match.Players)
            {
                if (_activeMatchByUser.TryGetValue(p.UserId, out var id) && id == match.Id)
                {
                    _activeMatchByUser.Remove(p.UserId);
                }
            }
        }

        log.LogInformation("Match {MatchId} ended: winnerTeam={WinnerTeam} reason={Reason}", match.Id, winnerTeam, reason);

        if (winner is not null)
        {
            try
            {
                await PersistResultAsync(match, winner);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Failed to persist result of match {MatchId}", match.Id);
            }
        }

        await hub.Clients.Group(match.GroupName).SendAsync("MatchEnded", result);
        foreach (var p in match.Players)
        {
            if (!p.Joined && p.ConnectionId is not null)
            {
                await hub.Clients.Client(p.ConnectionId).SendAsync("MatchEnded", result);
            }
        }

        _ = Task.Delay(Retention).ContinueWith(_ =>
        {
            lock (_lock)
            {
                _matches.Remove(match.Id);
            }
        }, TaskScheduler.Default);

        if (MatchFinished is { } handler)
        {
            try
            {
                await handler();
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "MatchFinished handler failed");
            }
        }
    }

    private async Task PersistResultAsync(Match match, MatchPlayer winner)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var ids = match.Players.Select(p => p.UserId).ToArray();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToListAsync();
        foreach (var user in users)
        {
            if (user.Id == winner.UserId)
            {
                user.Wins++;
            }
            else
            {
                user.Losses++;
            }
        }

        var startedAt = match.StartedAt ?? match.CreatedAt;
        var endedAt = match.EndedAt ?? DateTime.UtcNow;
        var entry = new GameLog
        {
            Mode = "multiplayer",
            StartedAt = startedAt,
            EndedAt = endedAt,
            DurationSeconds = Math.Round((endedAt - startedAt).TotalSeconds, 3),
            Result = $"{winner.Username} won",
            WinnerUserId = winner.UserId,
        };
        foreach (var p in match.Players)
        {
            entry.Players.Add(new GameLogPlayer { GameLogId = entry.Id, UserId = p.UserId, Side = p.Team });
        }

        db.GameLogs.Add(entry);
        await db.SaveChangesAsync();
    }
}
