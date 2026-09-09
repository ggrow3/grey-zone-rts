using System.Text.Json.Serialization;
using GreyZone.Server.Api;
using GreyZone.Server.Auth;
using GreyZone.Server.Data;
using GreyZone.Server.Hubs;
using GreyZone.Server.Lobby;
using GreyZone.Server.Matches;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Azure App Service (Linux) hands us the port via PORT; otherwise launchSettings / ASPNETCORE_URLS decide.
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } port)
{
    builder.WebHost.UseUrls($"http://*:{port}");
}

// ---- storage ----
var connectionString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
{
    var home = Environment.GetEnvironmentVariable("HOME");
    var dataDir = !builder.Environment.IsDevelopment() && !string.IsNullOrEmpty(home)
        ? Path.Combine(home, "data")
        : Path.Combine(builder.Environment.ContentRootPath, "Data");
    Directory.CreateDirectory(dataDir);
    connectionString = $"Data Source={Path.Combine(dataDir, "greyzone.db")}";
}

builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));

// ---- auth ----
var tokenService = new TokenService(builder.Configuration);
builder.Services.AddSingleton(tokenService);
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // keep "sub" / "name" as-is
        options.TokenValidationParameters = tokenService.ValidationParameters;
        options.Events = new JwtBearerEvents
        {
            // SignalR (WebSockets / SSE) cannot set headers, so the JS client sends the token as ?access_token=.
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

// ---- json (camelCase by default; drop nulls so optional fields are simply absent) ----
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);

// ---- realtime ----
builder.Services
    .AddSignalR(options => options.EnableDetailedErrors = builder.Environment.IsDevelopment())
    .AddJsonProtocol(options =>
        options.PayloadSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);

builder.Services.AddSingleton<MatchService>();
builder.Services.AddSingleton<LobbyService>();

// ---- cors (Vite dev server) ----
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();

if (tokenService.KeyWasGenerated)
{
    app.Logger.LogWarning(
        "Jwt:Key is missing or shorter than {Min} characters; a random signing key was generated. Issued tokens will not survive a restart.",
        TokenService.MinKeyLength);
}

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    app.Logger.LogInformation("SQLite database ready ({ConnectionString})", connectionString);
}

// Instantiate the lobby so it subscribes to match results even before the first hub connection.
app.Services.GetRequiredService<LobbyService>();

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapGameLogEndpoints();
app.MapHub<GameHub>("/hubs/game");

// SPA fallback: serve wwwroot/index.html for client-side routes, but never for /api, /hubs or file-like paths.
app.MapFallback(async context =>
{
    var path = context.Request.Path;
    if (path.StartsWithSegments("/api") || path.StartsWithSegments("/hubs") || Path.HasExtension(path.Value))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var index = app.Environment.WebRootFileProvider.GetFileInfo("index.html");
    if (!index.Exists)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    context.Response.ContentType = "text/html; charset=utf-8";
    await context.Response.SendFileAsync(index, context.RequestAborted);
});

app.Run();
