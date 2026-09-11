using GreyZone.Server.Data;
using GreyZone.Server.Hubs;
using GreyZone.Server.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace GreyZone.Server.Matches;

/// <summary>MatchService: the matchmaking queue and pairing players into matches.</summary>
public sealed partial class MatchService
{

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
}
