using System.Globalization;

namespace GreyZone.Server.Models;

// ---- REST ----

public sealed record RegisterRequest(string Username, string Password);
public sealed record LoginRequest(string Username, string Password);
public sealed record AuthResponse(string Token, string Username);
public sealed record ErrorResponse(string Error);

public sealed record MeResponse(string Username, int Wins, int Losses, string[] CompletedLevels);
public sealed record ProgressRequest(string LevelId);

public sealed record CreateGameRequest(string Mode, string? LevelId, int Side, double? Difficulty);
public sealed record CreateGameResponse(string Id);
public sealed record FinishGameRequest(string Result, double DurationSeconds);

public sealed record GameLogPlayerDto(string Username, int Side);

public sealed record GameLogEntry(
    string Id,
    string Mode,
    string? LevelId,
    List<GameLogPlayerDto> Players,
    string StartedAt,
    string? EndedAt,
    double? DurationSeconds,
    string? Result,
    string? WinnerUsername);

public sealed record LeaderboardEntry(string Username, int Wins, int Losses, int GamesPlayed);

// ---- SignalR (server -> client) ----

public sealed record LobbyStateDto(List<string> Online, int Queue, List<GameLogEntry> RecentGames);
public sealed record LobbyChatDto(string From, string Text, string At);
public sealed record QueueStatusDto(bool InQueue, int Position);

public sealed record MatchPlayerDto(string Username, int Team);
public sealed record CommandDto(int Team, string Payload);
public sealed record TurnDto(int Turn, List<CommandDto> Commands);

public sealed record MatchInfo(
    string MatchId,
    int Seed,
    int YourTeam,
    List<MatchPlayerDto> Players,
    int Turn,
    List<TurnDto> History,
    bool Running);

public sealed record MatchChatDto(string From, int Team, string Text, string At);
public sealed record OpponentConnectionDto(bool Connected, int GraceSeconds);
public sealed record DesyncDto(int Turn);
public sealed record MatchEndedDto(int WinnerTeam, string Reason, string? WinnerUsername);
public sealed record ErrorDto(string Message);

// ---- helpers ----

public static class TimeFormat
{
    /// <summary>UTC ISO-8601 with a trailing Z, as required by the protocol.</summary>
    public static string Iso(DateTime value)
        => DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("O", CultureInfo.InvariantCulture);

    public static string Now() => Iso(DateTime.UtcNow);
}
