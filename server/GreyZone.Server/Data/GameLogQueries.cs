using GreyZone.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace GreyZone.Server.Data;

/// <summary>Shared read queries that project <see cref="GameLog"/> rows into the public <see cref="GameLogEntry"/> shape.</summary>
public static class GameLogQueries
{
    public static Task<List<GameLogEntry>> RecentAsync(AppDbContext db, int limit, CancellationToken ct = default)
        => ToEntriesAsync(db.GameLogs, limit, ct);

    public static Task<List<GameLogEntry>> ForUserAsync(AppDbContext db, string userId, int limit, CancellationToken ct = default)
        => ToEntriesAsync(db.GameLogs.Where(g => g.Players.Any(p => p.UserId == userId)), limit, ct);

    private static async Task<List<GameLogEntry>> ToEntriesAsync(IQueryable<GameLog> query, int limit, CancellationToken ct)
    {
        var logs = await query
            .AsNoTracking()
            .Include(g => g.Players)
            .ThenInclude(p => p.User)
            .OrderByDescending(g => g.StartedAt)
            .ThenByDescending(g => g.Id)
            .Take(limit)
            .ToListAsync(ct);

        return logs.Select(ToEntry).ToList();
    }

    public static GameLogEntry ToEntry(GameLog g)
    {
        var players = g.Players
            .OrderBy(p => p.Side)
            .Select(p => new GameLogPlayerDto(p.User?.Username ?? "?", p.Side))
            .ToList();

        var winner = g.WinnerUserId is null
            ? null
            : g.Players.FirstOrDefault(p => p.UserId == g.WinnerUserId)?.User?.Username;

        return new GameLogEntry(
            g.Id,
            g.Mode,
            g.LevelId,
            players,
            TimeFormat.Iso(g.StartedAt),
            g.EndedAt is { } ended ? TimeFormat.Iso(ended) : null,
            g.DurationSeconds,
            g.Result,
            winner);
    }
}
