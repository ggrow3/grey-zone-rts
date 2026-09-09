using GreyZone.Server.Auth;
using GreyZone.Server.Lobby;
using GreyZone.Server.Matches;
using GreyZone.Server.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace GreyZone.Server.Hubs;

/// <summary>Single hub for lobby and match traffic; mapped at <c>/hubs/game</c>.</summary>
[Authorize]
public sealed class GameHub(LobbyService lobby, MatchService matches) : Hub
{
    private const int MaxChatLength = 500;

    private string UserId => Context.User?.GetUserId() ?? throw new HubException("Unauthenticated.");
    private string Username => Context.User?.GetUsername() ?? "?";

    public override async Task OnConnectedAsync()
    {
        var firstConnection = lobby.Add(Context.ConnectionId, UserId, Username);
        await Groups.AddToGroupAsync(Context.ConnectionId, LobbyService.GroupName);
        await lobby.SendStateAsync(Context.ConnectionId);
        await lobby.BroadcastStateAsync();
        if (firstConnection)
        {
            await lobby.SystemChatAsync($"{Username} joined");
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var lastConnection = lobby.Remove(Context.ConnectionId);
        var userId = Context.User?.GetUserId();
        if (userId is not null)
        {
            await matches.OnDisconnectedAsync(Context.ConnectionId, userId);
        }

        await lobby.BroadcastStateAsync();
        if (lastConnection)
        {
            await lobby.SystemChatAsync($"{Username} left");
        }

        await base.OnDisconnectedAsync(exception);
    }

    // ---- lobby ----

    public Task SendLobbyChat(string text)
    {
        text = Clean(text);
        if (text.Length == 0)
        {
            return Task.CompletedTask;
        }

        return Clients.Group(LobbyService.GroupName)
            .SendAsync("LobbyChat", new LobbyChatDto(Username, text, TimeFormat.Now()));
    }

    public async Task JoinQueue(int sidePref)
    {
        await matches.JoinQueueAsync(Context.ConnectionId, UserId, Username, sidePref);
        await lobby.BroadcastStateAsync();
    }

    public async Task LeaveQueue()
    {
        await matches.LeaveQueueAsync(Context.ConnectionId);
        await lobby.BroadcastStateAsync();
    }

    // ---- match ----

    public Task<MatchInfo> JoinMatch(string matchId)
        => matches.JoinMatchAsync(matchId ?? "", Context.ConnectionId, UserId);

    public Task SendCommand(string matchId, string payload)
    {
        matches.SendCommand(matchId ?? "", UserId, payload);
        return Task.CompletedTask;
    }

    public Task SendMatchChat(string matchId, string text)
        => matches.SendMatchChatAsync(matchId ?? "", UserId, Clean(text));

    public Task ReportHash(string matchId, int turn, string hash)
        => matches.ReportHashAsync(matchId ?? "", UserId, turn, hash);

    public Task ReportResult(string matchId, int winnerTeam)
        => matches.ReportResultAsync(matchId ?? "", UserId, winnerTeam);

    public Task LeaveMatch(string matchId)
        => matches.LeaveMatchAsync(matchId ?? "", UserId);

    private static string Clean(string? text)
    {
        var trimmed = (text ?? "").Trim();
        return trimmed.Length > MaxChatLength ? trimmed[..MaxChatLength] : trimmed;
    }
}
