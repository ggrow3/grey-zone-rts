using GreyZone.Server.Data;
using GreyZone.Server.Hubs;
using GreyZone.Server.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace GreyZone.Server.Matches;

/// <summary>MatchService: the turn loop, timeouts, ending a match, and persisting the result.</summary>
public sealed partial class MatchService
{

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
