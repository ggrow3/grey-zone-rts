using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using GreyZone.Server.Data;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace GreyZone.Server.Auth;

public sealed class TokenService
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);
    public const int MinKeyLength = 32;
    public const string DefaultIssuer = "greyzone";

    public SymmetricSecurityKey Key { get; }
    public string Issuer { get; }

    /// <summary>True when no usable <c>Jwt:Key</c> was configured and a random key was generated.</summary>
    public bool KeyWasGenerated { get; }

    public TokenService(IConfiguration configuration)
    {
        var configured = configuration["Jwt:Key"];
        Issuer = string.IsNullOrWhiteSpace(configuration["Jwt:Issuer"]) ? DefaultIssuer : configuration["Jwt:Issuer"]!;

        if (string.IsNullOrWhiteSpace(configured) || configured.Length < MinKeyLength)
        {
            Key = new SymmetricSecurityKey(RandomNumberGenerator.GetBytes(64));
            KeyWasGenerated = true;
        }
        else
        {
            Key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configured));
        }
    }

    public TokenValidationParameters ValidationParameters => new()
    {
        ValidateIssuer = true,
        ValidIssuer = Issuer,
        ValidateAudience = false,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = Key,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1),
        NameClaimType = JwtRegisteredClaimNames.Name,
    };

    public string CreateToken(User user)
    {
        var now = DateTime.UtcNow;
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id),
                new Claim(JwtRegisteredClaimNames.Name, user.Username),
            ]),
            IssuedAt = now,
            NotBefore = now,
            Expires = now + Lifetime,
            SigningCredentials = new SigningCredentials(Key, SecurityAlgorithms.HmacSha256),
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}

public static class ClaimsPrincipalExtensions
{
    public static string? GetUserId(this ClaimsPrincipal principal)
        => principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
           ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    public static string? GetUsername(this ClaimsPrincipal principal)
        => principal.FindFirst(JwtRegisteredClaimNames.Name)?.Value
           ?? principal.FindFirst(ClaimTypes.Name)?.Value;
}
