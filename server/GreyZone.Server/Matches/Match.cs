using GreyZone.Server.Models;

namespace GreyZone.Server.Matches;

public enum MatchState
{
    WaitingForPlayers,
    Running,
    Paused,
    Ended,
}

public sealed class MatchPlayer(string userId, string username, int team)
{
    public string UserId { get; } = userId;
    public string Username { get; } = username;
    public int Team { get; } = team;

    /// <summary>Most recent connection for this player (the one that received MatchFound or last called JoinMatch).</summary>
    public string? ConnectionId { get; set; }

    /// <summary>Has called JoinMatch at least once (and is therefore in the match group).</summary>
    public bool Joined { get; set; }

    public bool Connected { get; set; }

    public CancellationTokenSource? GraceCts { get; set; }
    public DateTime? GraceDeadline { get; set; }

    /// <summary>Recent state hashes reported by this player, keyed by turn.</summary>
    public Dictionary<int, string> Hashes { get; } = new();
}

public sealed class Match
{
    public string Id { get; } = Guid.NewGuid().ToString("N");
    public required int Seed { get; init; }
    public required MatchPlayer[] Players { get; init; }

    public MatchState State { get; set; } = MatchState.WaitingForPlayers;
    public int Turn { get; set; }
    public List<TurnDto> History { get; } = new();
    public List<CommandDto> Pending { get; set; } = new();

    public DateTime CreatedAt { get; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public MatchEndedDto? Result { get; set; }

    public int LastDesyncTurn { get; set; } = -1;

    public CancellationTokenSource LoopCts { get; } = new();
    public CancellationTokenSource JoinTimeoutCts { get; } = new();
    public Task? LoopTask { get; set; }

    /// <summary>Guards all mutable match state above.</summary>
    public object Sync { get; } = new();

    public string GroupName => "match:" + Id;

    public MatchPlayer? PlayerByUser(string userId)
        => Players.FirstOrDefault(p => p.UserId == userId);

    public MatchPlayer Opponent(MatchPlayer player)
        => Players[0] == player ? Players[1] : Players[0];

    public MatchPlayer? PlayerByTeam(int team)
        => Players.FirstOrDefault(p => p.Team == team);

    /// <summary>Snapshot for a given recipient. Call while holding <see cref="Sync"/>.</summary>
    public MatchInfo ToInfo(int yourTeam) => new(
        Id,
        Seed,
        yourTeam,
        Players.Select(p => new MatchPlayerDto(p.Username, p.Team)).ToList(),
        Turn,
        History.ToList(),
        State == MatchState.Running);
}
