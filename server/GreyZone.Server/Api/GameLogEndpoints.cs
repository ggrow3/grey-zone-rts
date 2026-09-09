using System.Security.Claims;
using GreyZone.Server.Auth;
using GreyZone.Server.Data;
using GreyZone.Server.Models;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace GreyZone.Server.Api;

/// <summary>/api/me, /api/progress, /api/games/*, /api/leaderboard</summary>
public static class GameLogEndpoints
{
    private const int DefaultLimit = 50;
    private const int MaxLimit = 200;
    private const int LeaderboardSize = 20;

    private static readonly HashSet<string> Modes = new(StringComparer.Ordinal) { "level", "skirmish", "multiplayer" };
    private static readonly HashSet<string> SoloResults = new(StringComparer.Ordinal) { "won", "lost", "abandoned" };

    public static IEndpointRouteBuilder MapGameLogEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization();
        api.MapGet("/me", MeAsync);
        api.MapPost("/progress", ProgressAsync);
        api.MapPost("/games", CreateGameAsync);
        api.MapPost("/games/{id}/finish", FinishGameAsync);
        api.MapGet("/games/recent", RecentAsync);
        api.MapGet("/games/mine", MineAsync);
        api.MapGet("/leaderboard", LeaderboardAsync);
        return app;
    }

    private static async Task<Results<Ok<MeResponse>, UnauthorizedHttpResult>> MeAsync(
        ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        var user = userId is null ? null : await db.Users.FindAsync([userId], ct);
        if (user is null)
        {
            return TypedResults.Unauthorized();
        }

        var completed = await db.LevelProgress
            .Where(p => p.UserId == user.Id)
            .OrderBy(p => p.CompletedAt)
            .Select(p => p.LevelId)
            .ToArrayAsync(ct);

        return TypedResults.Ok(new MeResponse(user.Username, user.Wins, user.Losses, completed));
    }

    private static async Task<Results<NoContent, BadRequest<ErrorResponse>, UnauthorizedHttpResult>> ProgressAsync(
        ProgressRequest request, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var levelId = request.LevelId?.Trim();
        if (string.IsNullOrEmpty(levelId) || levelId.Length > 100)
        {
            return TypedResults.BadRequest(new ErrorResponse("levelId is required (max 100 characters)."));
        }

        var userId = principal.GetUserId();
        if (userId is null || !await db.Users.AnyAsync(u => u.Id == userId, ct))
        {
            return TypedResults.Unauthorized();
        }

        var existing = await db.LevelProgress.SingleOrDefaultAsync(p => p.UserId == userId && p.LevelId == levelId, ct);
        if (existing is null)
        {
            db.LevelProgress.Add(new LevelProgress { UserId = userId, LevelId = levelId, CompletedAt = DateTime.UtcNow });
        }
        else
        {
            existing.CompletedAt = DateTime.UtcNow;
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Concurrent upsert of the same (user, level): the row exists, which is the desired end state.
        }

        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<CreateGameResponse>, BadRequest<ErrorResponse>, UnauthorizedHttpResult>> CreateGameAsync(
        CreateGameRequest request, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (request.Mode is null || !Modes.Contains(request.Mode))
        {
            return TypedResults.BadRequest(new ErrorResponse("mode must be \"level\", \"skirmish\" or \"multiplayer\"."));
        }

        if (request.Side is not (0 or 1))
        {
            return TypedResults.BadRequest(new ErrorResponse("side must be 0 or 1."));
        }

        var userId = principal.GetUserId();
        if (userId is null || !await db.Users.AnyAsync(u => u.Id == userId, ct))
        {
            return TypedResults.Unauthorized();
        }

        var log = new GameLog
        {
            Mode = request.Mode,
            LevelId = string.IsNullOrWhiteSpace(request.LevelId) ? null : request.LevelId.Trim(),
            StartedAt = DateTime.UtcNow,
        };
        log.Players.Add(new GameLogPlayer { GameLogId = log.Id, UserId = userId, Side = request.Side });

        db.GameLogs.Add(log);
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new CreateGameResponse(log.Id));
    }

    private static async Task<Results<NoContent, NotFound, BadRequest<ErrorResponse>>> FinishGameAsync(
        string id, FinishGameRequest request, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (request.Result is null || !SoloResults.Contains(request.Result))
        {
            return TypedResults.BadRequest(new ErrorResponse("result must be \"won\", \"lost\" or \"abandoned\"."));
        }

        if (!double.IsFinite(request.DurationSeconds) || request.DurationSeconds < 0)
        {
            return TypedResults.BadRequest(new ErrorResponse("durationSeconds must be a non-negative number."));
        }

        var userId = principal.GetUserId();
        var log = await db.GameLogs.Include(g => g.Players).SingleOrDefaultAsync(g => g.Id == id, ct);
        if (log is null || userId is null || !log.Players.Any(p => p.UserId == userId))
        {
            // Not found, or not owned by the caller: the protocol treats both as 404.
            return TypedResults.NotFound();
        }

        log.EndedAt = DateTime.UtcNow;
        log.DurationSeconds = request.DurationSeconds;
        log.Result = request.Result;
        log.WinnerUserId = request.Result == "won" ? userId : null;
        await db.SaveChangesAsync(ct);

        return TypedResults.NoContent();
    }

    private static async Task<Ok<List<GameLogEntry>>> RecentAsync(int? limit, AppDbContext db, CancellationToken ct)
        => TypedResults.Ok(await GameLogQueries.RecentAsync(db, ClampLimit(limit), ct));

    private static async Task<Results<Ok<List<GameLogEntry>>, UnauthorizedHttpResult>> MineAsync(
        int? limit, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = principal.GetUserId();
        if (userId is null)
        {
            return TypedResults.Unauthorized();
        }

        return TypedResults.Ok(await GameLogQueries.ForUserAsync(db, userId, ClampLimit(limit), ct));
    }

    private static async Task<Ok<List<LeaderboardEntry>>> LeaderboardAsync(AppDbContext db, CancellationToken ct)
    {
        var rows = await db.Users
            .AsNoTracking()
            .OrderByDescending(u => u.Wins)
            .ThenBy(u => u.Losses)
            .ThenBy(u => u.Username)
            .Take(LeaderboardSize)
            .Select(u => new LeaderboardEntry(
                u.Username,
                u.Wins,
                u.Losses,
                db.GameLogPlayers.Count(p => p.UserId == u.Id)))
            .ToListAsync(ct);

        return TypedResults.Ok(rows);
    }

    private static int ClampLimit(int? limit) => Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);
}
