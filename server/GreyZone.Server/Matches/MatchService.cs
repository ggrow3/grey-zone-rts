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
public sealed partial class MatchService
{
    private readonly IHubContext<GameHub> hub;
    private readonly IServiceScopeFactory scopes;
    private readonly ILogger<MatchService> log;

    public MatchService(IHubContext<GameHub> hub, IServiceScopeFactory scopes, ILogger<MatchService> log)
    {
        this.hub = hub;
        this.scopes = scopes;
        this.log = log;
    }

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
}
