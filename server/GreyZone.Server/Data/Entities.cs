namespace GreyZone.Server.Data;

public sealed class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Username { get; set; } = "";
    public string NormalizedUsername { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int Wins { get; set; }
    public int Losses { get; set; }
}

public sealed class LevelProgress
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = "";
    public string LevelId { get; set; } = "";
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}

public sealed class GameLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Mode { get; set; } = "";
    public string? LevelId { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
    public double? DurationSeconds { get; set; }
    public string? Result { get; set; }
    public string? WinnerUserId { get; set; }

    public List<GameLogPlayer> Players { get; set; } = new();
}

public sealed class GameLogPlayer
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string GameLogId { get; set; } = "";
    public string UserId { get; set; } = "";
    public int Side { get; set; }

    public GameLog? GameLog { get; set; }
    public User? User { get; set; }
}
