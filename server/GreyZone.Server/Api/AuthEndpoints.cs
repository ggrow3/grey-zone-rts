using System.Text.RegularExpressions;
using GreyZone.Server.Auth;
using GreyZone.Server.Data;
using GreyZone.Server.Models;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace GreyZone.Server.Api;

public static partial class AuthEndpoints
{
    public const int MinPasswordLength = 6;

    [GeneratedRegex("^[A-Za-z0-9_]{3,20}$")]
    private static partial Regex UsernameRegex();

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");
        group.MapPost("/register", RegisterAsync);
        group.MapPost("/login", LoginAsync);
        return app;
    }

    private static async Task<Results<Ok<AuthResponse>, BadRequest<ErrorResponse>>> RegisterAsync(
        RegisterRequest request,
        AppDbContext db,
        IPasswordHasher<User> hasher,
        TokenService tokens,
        CancellationToken ct)
    {
        var username = request.Username?.Trim() ?? "";
        if (!UsernameRegex().IsMatch(username))
        {
            return TypedResults.BadRequest(new ErrorResponse("Username must be 3-20 characters: letters, digits or underscore."));
        }

        if (request.Password is null || request.Password.Length < MinPasswordLength)
        {
            return TypedResults.BadRequest(new ErrorResponse($"Password must be at least {MinPasswordLength} characters."));
        }

        var normalized = username.ToUpperInvariant();
        if (await db.Users.AnyAsync(u => u.NormalizedUsername == normalized, ct))
        {
            return TypedResults.BadRequest(new ErrorResponse("Username is already taken."));
        }

        var user = new User { Username = username, NormalizedUsername = normalized };
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        db.Users.Add(user);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Lost a race against another registration with the same name (unique index).
            return TypedResults.BadRequest(new ErrorResponse("Username is already taken."));
        }

        return TypedResults.Ok(new AuthResponse(tokens.CreateToken(user), user.Username));
    }

    private static async Task<Results<Ok<AuthResponse>, JsonHttpResult<ErrorResponse>>> LoginAsync(
        LoginRequest request,
        AppDbContext db,
        IPasswordHasher<User> hasher,
        TokenService tokens,
        CancellationToken ct)
    {
        var normalized = (request.Username ?? "").Trim().ToUpperInvariant();
        if (normalized.Length == 0 || string.IsNullOrEmpty(request.Password))
        {
            return Unauthorized();
        }

        var user = await db.Users.SingleOrDefaultAsync(u => u.NormalizedUsername == normalized, ct);
        if (user is null)
        {
            return Unauthorized();
        }

        var verification = hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return Unauthorized();
        }

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            await db.SaveChangesAsync(ct);
        }

        return TypedResults.Ok(new AuthResponse(tokens.CreateToken(user), user.Username));

        static JsonHttpResult<ErrorResponse> Unauthorized()
            => TypedResults.Json(new ErrorResponse("Invalid username or password."), statusCode: StatusCodes.Status401Unauthorized);
    }
}
