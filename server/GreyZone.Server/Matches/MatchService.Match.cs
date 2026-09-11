using GreyZone.Server.Data;
using GreyZone.Server.Hubs;
using GreyZone.Server.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace GreyZone.Server.Matches;

/// <summary>MatchService: what a connected player can do inside a match.</summary>
public sealed partial class MatchService
{

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
}
