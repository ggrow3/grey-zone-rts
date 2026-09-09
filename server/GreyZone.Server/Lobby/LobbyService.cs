using System.Collections.Concurrent;
using GreyZone.Server.Data;
using GreyZone.Server.Hubs;
using GreyZone.Server.Matches;
using GreyZone.Server.Models;
using Microsoft.AspNetCore.SignalR;

namespace GreyZone.Server.Lobby;

/// <summary>Singleton tracking online users (by connection id) and broadcasting <c>LobbyState</c>.</summary>
public sealed class LobbyService
{
    public const string GroupName = "lobby";
    private const int RecentGamesCount = 10;

    private sealed record LobbyUser(string UserId, string Username);

    private readonly IHubContext<GameHub> _hub;
    private readonly IServiceScopeFactory _scopes;
    private readonly MatchService _matches;
    private readonly ILogger<LobbyService> _log;
    private readonly ConcurrentDictionary<string, LobbyUser> _online = new();

    public LobbyService(IHubContext<GameHub> hub, IServiceScopeFactory scopes, MatchService matches, ILogger<LobbyService> log)
    {
        _hub = hub;
        _scopes = scopes;
        _matches = matches;
        _log = log;
        _matches.MatchFinished += BroadcastStateAsync;
    }

    /// <summary>Registers a connection. Returns true if this user was not online before (first connection).</summary>
    public bool Add(string connectionId, string userId, string username)
    {
        var wasOnline = IsOnline(userId);
        _online[connectionId] = new LobbyUser(userId, username);
        return !wasOnline;
    }

    /// <summary>Unregisters a connection. Returns true if the user now has no connections left.</summary>
    public bool Remove(string connectionId)
    {
        if (!_online.TryRemove(connectionId, out var user))
        {
            return false;
        }

        return !IsOnline(user.UserId);
    }

    private bool IsOnline(string userId) => _online.Values.Any(u => u.UserId == userId);

    public async Task<LobbyStateDto> BuildStateAsync()
    {
        var online = _online.Values
            .Select(u => u.Username)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(u => u, StringComparer.OrdinalIgnoreCase)
            .ToList();

        List<GameLogEntry> recent;
        try
        {
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            recent = await GameLogQueries.RecentAsync(db, RecentGamesCount);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Failed to load recent games for the lobby");
            recent = new List<GameLogEntry>();
        }

        return new LobbyStateDto(online, _matches.QueueCount, recent);
    }

    public async Task SendStateAsync(string connectionId)
        => await _hub.Clients.Client(connectionId).SendAsync("LobbyState", await BuildStateAsync());

    public async Task BroadcastStateAsync()
        => await _hub.Clients.Group(GroupName).SendAsync("LobbyState", await BuildStateAsync());

    public Task SystemChatAsync(string text)
        => _hub.Clients.Group(GroupName).SendAsync("LobbyChat", new LobbyChatDto("system", text, TimeFormat.Now()));
}
