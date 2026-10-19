/* WatchParty - Live Meeting Room Logic (Clean White Theme) */
"use strict";

// Meeting State
var meetingState = {
  code: MEETING_CODE,
  userName: USER_NAME,
  isHost: IS_HOST_INIT,
  hostSid: null,
  socket: null,
  participants: [],
  activeTab: "panel-participants",
  currentView: "gallery", // "gallery" or "theater"
  isMuted: false,
  isVideoOff: false,
  player: null,
  playerReady: false,
  isPlaying: false,
  duration: 0,
};

// ---------------------------------------------------------------------------
// Toast Notification System
// ---------------------------------------------------------------------------
function showToast(msg) {
  var box = document.getElementById("toast-toast-box");
  var t = document.createElement("div");
  t.className = "zoom-toast";
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(function () {
    t.style.opacity = "0";
    t.style.transform = "translateY(10px)";
    t.style.transition = "all 0.3s";
    setTimeout(function () { t.remove(); }, 300);
  }, 3200);
}

// ---------------------------------------------------------------------------
// Modal Helpers
// ---------------------------------------------------------------------------
function openModal(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = "flex";
}
function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = "none";
}

// ---------------------------------------------------------------------------
// Socket.IO Initialization
// ---------------------------------------------------------------------------
function initSocket() {
  meetingState.socket = io();

  meetingState.socket.on("connect", function () {
    console.log("[SOCKET] Connected to meeting server");
    meetingState.socket.emit("join_meeting", {
      code: meetingState.code,
      name: meetingState.userName,
      is_host: meetingState.isHost
    });
  });

  meetingState.socket.on("meeting_state", function (data) {
    meetingState.participants = data.participants || [];
    meetingState.hostSid = data.host_sid;
    renderParticipantsGrid();
    renderParticipantsList();
    renderChat(data.chat || []);
    renderPolls(data.polls || []);
    updatePeopleCount();

    if (data.video_url && data.video_url !== VIDEO_URL_INIT) {
      loadVideoUrl(data.video_url);
    }
  });

  meetingState.socket.on("update_participants", function (data) {
    meetingState.participants = data.participants || [];
    renderParticipantsGrid();
    renderParticipantsList();
    updatePeopleCount();
  });

  meetingState.socket.on("host_changed", function (data) {
    showToast("👑 Host role transferred to: " + data.new_host_name);
    var tag = document.getElementById("current-role-tag");
    if (data.new_host_id === meetingState.socket.id) {
      meetingState.isHost = true;
      if (tag) tag.textContent = "Host";
    } else {
      meetingState.isHost = false;
      if (tag) tag.textContent = "Participant";
    }
    var infoHost = document.getElementById("info-host-name");
    if (infoHost) infoHost.textContent = data.new_host_name;
  });

  meetingState.socket.on("sync_play", function (data) {
    if (meetingState.player && meetingState.playerReady) {
      meetingState.player.seekTo(data.position, true);
      meetingState.player.playVideo();
      meetingState.isPlaying = true;
      updatePlayBtnLabel(true);
    }
  });

  meetingState.socket.on("sync_pause", function (data) {
    if (meetingState.player && meetingState.playerReady) {
      meetingState.player.seekTo(data.position, true);
      meetingState.player.pauseVideo();
      meetingState.isPlaying = false;
      updatePlayBtnLabel(false);
    }
  });

  meetingState.socket.on("sync_seek", function (data) {
    if (meetingState.player && meetingState.playerReady) {
      meetingState.player.seekTo(data.position, true);
    }
  });

  meetingState.socket.on("sync_video_change", function (data) {
    loadVideoUrl(data.url);
    showToast("🎬 Host loaded new video");
  });

  meetingState.socket.on("new_chat_message", function (msg) {
    appendChatMessage(msg);
    // If chat tab is not active, increment unread badge
    if (meetingState.activeTab !== "panel-chat") {
      var badge = document.getElementById("chat-badge");
      if (badge) {
        badge.style.display = "inline-block";
        var count = parseInt(badge.textContent || "0", 10) + 1;
        badge.textContent = count;
      }
    }
  });

  meetingState.socket.on("show_reaction", function (data) {
    triggerReactionBurst(data.emoji, data.sender);
  });

  meetingState.socket.on("update_poll", function (poll) {
    updatePollCard(poll);
  });

  meetingState.socket.on("poll_created", function (poll) {
    appendPollCard(poll);
    showToast("📊 New poll created: " + poll.question);
  });
}

// ---------------------------------------------------------------------------
// Live participant gallery rendering
// ---------------------------------------------------------------------------
function renderParticipantsGrid() {
  var grid = document.getElementById("gallery-grid");
  if (!grid) return;
  grid.innerHTML = "";

  meetingState.participants.forEach(function (p, index) {
    var tile = document.createElement("div");
    tile.className = "zoom-tile" + (p.is_talking ? " speaking" : "");
    tile.id = "tile-" + p.id;

    // Tile inner
    tile.innerHTML = [
      '<div class="tile-avatar-circle" style="background-color:' + (p.bg || '#3b82f6') + '">',
      '  <span class="avatar-letters">' + (p.avatar || p.name.substring(0, 2).toUpperCase()) + '</span>',
      '  <div class="avatar-audio-wave"></div>',
      '</div>',
      '<div class="tile-sub-status">' + (p.is_host ? "Host" : "Participant") + '</div>',
      '<div class="tile-name-bar">',
      p.is_host ? '  <span class="tile-host-icon">👑</span>' : '',
      '  <span>' + p.name + '</span>',
      '  <span class="tile-mic-icon ' + (p.audio ? '' : 'muted') + '">' + (p.audio ? '🎙️' : '🔇') + '</span>',
      '</div>',
      '<div class="tile-hover-options">',
      '  <button class="tile-opt-btn" onclick="transferHostTo(\'' + p.id + '\')">Make Host</button>',
      '</div>'
    ].join("");

    grid.appendChild(tile);
  });
}

// ---------------------------------------------------------------------------
// Zoom Participants Window Rendering
// ---------------------------------------------------------------------------
function renderParticipantsList() {
  var list = document.getElementById("participants-scroll-list");
  if (!list) return;
  list.innerHTML = "";

  meetingState.participants.forEach(function (p) {
    var row = document.createElement("div");
    row.className = "participant-row";
    row.innerHTML = [
      '<div class="p-row-left">',
      '  <div class="p-avatar-sm" style="background:' + (p.bg || '#2563eb') + '">' + (p.avatar || p.name.substring(0, 2).toUpperCase()) + '</div>',
      '  <div class="p-name-col">',
      '    <span class="p-full-name">' + p.name + '</span>',
      '    <span class="p-role-sub">' + (p.is_host ? "Meeting Host" : "Participant") + '</span>',
      '  </div>',
      '</div>',
      '<div class="p-row-right">',
      '  <span class="p-mic-status">' + (p.audio ? "🎙️" : "🔇") + '</span>',
      '  <span class="p-cam-status">' + (p.video ? "📹" : "🚫") + '</span>',
      p.is_host ? '' : '  <button class="btn-make-host-sm" onclick="transferHostTo(\'' + p.id + '\')">Make Host</button>',
      '</div>'
    ].join("");
    list.appendChild(row);
  });
}

function updatePeopleCount() {
  var count = meetingState.participants.length;
  var el1 = document.getElementById("people-count");
  var el2 = document.getElementById("dock-people-count");
  if (el1) el1.textContent = count;
  if (el2) el2.textContent = count;
}

// ---------------------------------------------------------------------------
// Chat System
// ---------------------------------------------------------------------------
function renderChat(chatList) {
  var stream = document.getElementById("chat-message-stream");
  if (!stream) return;
  stream.innerHTML = "";
  chatList.forEach(function (m) {
    appendChatMessage(m);
  });
}

function appendChatMessage(msg) {
  var stream = document.getElementById("chat-message-stream");
  if (!stream) return;

  var bubble = document.createElement("div");
  bubble.className = "chat-bubble" + (msg.name === meetingState.userName ? " mine" : "");
  bubble.innerHTML = [
    '<div class="chat-meta">',
    '  <span class="chat-sender">' + msg.name + '</span>',
    '  <span class="chat-time">' + (msg.time || "Now") + '</span>',
    '</div>',
    '<div class="chat-text">' + msg.text + '</div>'
  ].join("");

  stream.appendChild(bubble);
  stream.scrollTop = stream.scrollHeight;
}

function insertEmoji(em) {
  var inp = document.getElementById("chat-text-input");
  if (inp) {
    inp.value += em;
    inp.focus();
  }
}

// ---------------------------------------------------------------------------
// Floating Reactions (Zoom-Style Burst)
// ---------------------------------------------------------------------------
function triggerReactionBurst(emoji, sender) {
  var zone = document.getElementById("reactions-floating-zone");
  if (!zone) return;

  var bubble = document.createElement("div");
  bubble.className = "tile-reaction-bubble";
  bubble.textContent = emoji;
  bubble.style.left = (15 + Math.random() * 70) + "%";

  zone.appendChild(bubble);
  setTimeout(function () { bubble.remove(); }, 1900);
}

// ---------------------------------------------------------------------------
// Polls System
// ---------------------------------------------------------------------------
function renderPolls(pollList) {
  var container = document.getElementById("active-polls-list");
  if (!container) return;
  container.innerHTML = "";
  pollList.forEach(function (p) {
    appendPollCard(p);
  });
}

function appendPollCard(poll) {
  var container = document.getElementById("active-polls-list");
  if (!container) return;

  var card = document.createElement("div");
  card.className = "poll-active-card";
  card.id = "poll-card-" + poll.id;

  var totalVotes = 0;
  for (var opt in poll.votes) {
    totalVotes += (poll.votes[opt] || []).length;
  }

  var optsHtml = poll.options.map(function (opt) {
    var vCount = (poll.votes[opt] || []).length;
    var pct = totalVotes > 0 ? Math.round((vCount / totalVotes) * 100) : 0;
    return [
      '<div class="poll-option-row">',
      '  <button class="poll-opt-btn" onclick="voteOnPoll(\'' + poll.id + '\', \'' + opt + '\')">',
      '    <span>' + opt + '</span>',
      '    <strong>' + pct + '% (' + vCount + ')</strong>',
      '  </button>',
      '  <div class="poll-bar-fill" style="width:' + pct + '%"></div>',
      '</div>'
    ].join("");
  }).join("");

  card.innerHTML = [
    '<div class="poll-q-title">📊 ' + poll.question + '</div>',
    optsHtml,
    '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">Total votes: ' + totalVotes + ' • Created by ' + (poll.created_by || "Host") + '</div>'
  ].join("");

  container.prepend(card);
}

function updatePollCard(poll) {
  var existing = document.getElementById("poll-card-" + poll.id);
  if (existing) {
    existing.remove();
  }
  appendPollCard(poll);
}

function voteOnPoll(pollId, option) {
  meetingState.socket.emit("submit_vote", {
    code: meetingState.code,
    poll_id: pollId,
    option: option,
    voter_id: meetingState.socket.id
  });
  showToast("Voted for: " + option);
}

// ---------------------------------------------------------------------------
// Host Transfer
// ---------------------------------------------------------------------------
window.transferHostTo = function (targetId) {
  meetingState.socket.emit("transfer_host", {
    code: meetingState.code,
    target_id: targetId
  });
  closeModal("modal-host-transfer");
};

function populateHostCandidatesModal() {
  var list = document.getElementById("host-candidates-list");
  if (!list) return;
  list.innerHTML = "";

  meetingState.participants.forEach(function (p) {
    if (p.is_host) return; // skip current host
    var row = document.createElement("div");
    row.className = "candidate-row";
    row.innerHTML = [
      '<span>' + p.name + '</span>',
      '<button class="btn-secondary" style="font-size:0.75rem;padding:0.25rem 0.6rem">Select</button>'
    ].join("");
    row.onclick = function () {
      transferHostTo(p.id);
    };
    list.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// YouTube IFrame API Synchronization
// ---------------------------------------------------------------------------
window.onYouTubeIframeAPIReady = function () {
  var vidId = extractYouTubeID(VIDEO_URL_INIT) || "zSWdZVtXT7E";
  meetingState.player = new YT.Player("yt-player-target", {
    height: "100%",
    width: "100%",
    videoId: vidId,
    playerVars: {
      playsinline: 1,
      rel: 0,
      modestbranding: 1
    },
    events: {
      onReady: function () {
        meetingState.playerReady = true;
        console.log("[YT] Player ready");
      },
      onStateChange: function (e) {
        if (e.data === YT.PlayerState.PLAYING) {
          meetingState.duration = meetingState.player.getDuration();
        }
      }
    }
  });
};

function extractYouTubeID(url) {
  if (!url) return null;
  var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return m ? m[1] : null;
}

function loadVideoUrl(url) {
  var ytid = extractYouTubeID(url);
  if (ytid && meetingState.player && meetingState.playerReady) {
    meetingState.player.loadVideoById(ytid);
    document.getElementById("custom-video-url").value = url;
  }
}

function updatePlayBtnLabel(isPlaying) {
  var btn = document.getElementById("ctrl-play-pause");
  if (btn) btn.textContent = isPlaying ? "⏸ Pause" : "▶ Play";
}

// ---------------------------------------------------------------------------
// Document Ready & Event Bindings
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  initSocket();

  // 1. Copy 6-Digit Code Badge
  var codeBadge = document.getElementById("copy-code-badge");
  if (codeBadge) {
    codeBadge.addEventListener("click", function () {
      navigator.clipboard.writeText(meetingState.code).then(function () {
        showToast("📋 6-Digit Code copied: " + meetingState.code);
      });
    });
  }

  // 2. View Switcher (Gallery vs Theater)
  var btnGallery = document.getElementById("btn-view-gallery");
  var btnTheater = document.getElementById("btn-view-theater");
  var dockBtnTheater = document.getElementById("dock-btn-theater");
  var galleryView = document.getElementById("gallery-grid");
  var theaterView = document.getElementById("theater-mode-view");

  function setView(view) {
    meetingState.currentView = view;
    if (view === "gallery") {
      galleryView.style.display = "grid";
      theaterView.style.display = "none";
      btnGallery.classList.add("active");
      btnTheater.classList.remove("active");
    } else {
      galleryView.style.display = "none";
      theaterView.style.display = "flex";
      btnTheater.classList.add("active");
      btnGallery.classList.remove("active");
    }
  }

  if (btnGallery) btnGallery.addEventListener("click", function () { setView("gallery"); });
  if (btnTheater) btnTheater.addEventListener("click", function () { setView("theater"); });
  if (dockBtnTheater) dockBtnTheater.addEventListener("click", function () {
    setView(meetingState.currentView === "gallery" ? "theater" : "gallery");
  });

  // 3. Side Window Tabs
  var tabBtns = document.querySelectorAll(".side-window-tabs .tab-btn");
  var tabContents = document.querySelectorAll(".side-tab-content");
  var sideWindow = document.getElementById("zoom-side-window");

  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.target;
      meetingState.activeTab = target;
      sideWindow.classList.remove("collapsed");

      tabBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");

      tabContents.forEach(function (tc) {
        tc.classList.toggle("active", tc.id === target);
      });

      // Clear chat unread badge if opening chat
      if (target === "panel-chat") {
        var badge = document.getElementById("chat-badge");
        if (badge) badge.style.display = "none";
      }
    });
  });

  // Close Side Panel Button
  var btnCloseSide = document.getElementById("btn-close-side");
  if (btnCloseSide) {
    btnCloseSide.addEventListener("click", function () {
      sideWindow.classList.add("collapsed");
    });
  }

  // 4. Dock Buttons
  var dockPeople = document.getElementById("dock-btn-people");
  var dockChat = document.getElementById("dock-btn-chat");
  var dockPolls = document.getElementById("dock-btn-polls");

  if (dockPeople) dockPeople.addEventListener("click", function () {
    sideWindow.classList.remove("collapsed");
    document.querySelector('[data-target="panel-participants"]').click();
  });
  if (dockChat) dockChat.addEventListener("click", function () {
    sideWindow.classList.remove("collapsed");
    document.querySelector('[data-target="panel-chat"]').click();
  });
  if (dockPolls) dockPolls.addEventListener("click", function () {
    sideWindow.classList.remove("collapsed");
    document.querySelector('[data-target="panel-polls"]').click();
  });

  // 5. Mic & Cam Toggles
  var btnMute = document.getElementById("dock-btn-mute");
  if (btnMute) {
    btnMute.addEventListener("click", function () {
      meetingState.isMuted = !meetingState.isMuted;
      document.getElementById("dock-mic-icon").textContent = meetingState.isMuted ? "🔇" : "🎙️";
      document.getElementById("dock-mic-label").textContent = meetingState.isMuted ? "Unmute" : "Mute";
      showToast(meetingState.isMuted ? "Microphone muted" : "Microphone active");
    });
  }

  var btnVideo = document.getElementById("dock-btn-video");
  if (btnVideo) {
    btnVideo.addEventListener("click", function () {
      meetingState.isVideoOff = !meetingState.isVideoOff;
      document.getElementById("dock-cam-icon").textContent = meetingState.isVideoOff ? "🚫" : "📹";
      document.getElementById("dock-cam-label").textContent = meetingState.isVideoOff ? "Start Video" : "Stop Video";
      showToast(meetingState.isVideoOff ? "Camera stopped" : "Camera started");
    });
  }

  // 6. Reactions Menu
  var btnReactions = document.getElementById("dock-btn-reactions");
  var reactMenu = document.getElementById("zoom-reaction-menu");
  if (btnReactions && reactMenu) {
    btnReactions.addEventListener("click", function (e) {
      e.stopPropagation();
      reactMenu.style.display = reactMenu.style.display === "none" ? "flex" : "none";
    });

    document.querySelectorAll(".react-pill").forEach(function (pill) {
      pill.addEventListener("click", function () {
        var emoji = pill.dataset.emoji;
        meetingState.socket.emit("send_reaction", {
          code: meetingState.code,
          emoji: emoji,
          name: meetingState.userName
        });
        reactMenu.style.display = "none";
      });
    });

    document.addEventListener("click", function () {
      reactMenu.style.display = "none";
    });
  }

  // 7. Chat Send
  var chatForm = document.getElementById("chat-form");
  if (chatForm) {
    chatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = document.getElementById("chat-text-input");
      var text = inp.value.trim();
      if (!text) return;
      meetingState.socket.emit("chat_message", {
        code: meetingState.code,
        name: meetingState.userName,
        text: text
      });
      inp.value = "";
    });
  }

  // 8. Video Sync Controls
  var btnPlay = document.getElementById("ctrl-play-pause");
  if (btnPlay) {
    btnPlay.addEventListener("click", function () {
      if (!meetingState.playerReady) return;
      var cur = meetingState.player.getCurrentTime();
      if (meetingState.isPlaying) {
        meetingState.socket.emit("pause_video", { code: meetingState.code });
      } else {
        meetingState.socket.emit("play_video", { code: meetingState.code, position: cur });
      }
    });
  }

  var btnBack10 = document.getElementById("ctrl-back-10");
  if (btnBack10) {
    btnBack10.addEventListener("click", function () {
      if (!meetingState.playerReady) return;
      var cur = Math.max(0, meetingState.player.getCurrentTime() - 10);
      meetingState.socket.emit("seek_video", { code: meetingState.code, position: cur });
    });
  }

  var btnFwd10 = document.getElementById("ctrl-fwd-10");
  if (btnFwd10) {
    btnFwd10.addEventListener("click", function () {
      if (!meetingState.playerReady) return;
      var cur = meetingState.player.getCurrentTime() + 10;
      meetingState.socket.emit("seek_video", { code: meetingState.code, position: cur });
    });
  }

  var btnLoadVid = document.getElementById("btn-load-vid");
  if (btnLoadVid) {
    btnLoadVid.addEventListener("click", function () {
      var url = document.getElementById("custom-video-url").value.trim();
      if (url) {
        meetingState.socket.emit("change_video_url", { code: meetingState.code, url: url });
      }
    });
  }

  // 9. Create Poll Form
  var btnLaunchPoll = document.getElementById("btn-launch-poll");
  if (btnLaunchPoll) {
    btnLaunchPoll.addEventListener("click", function () {
      var q = document.getElementById("new-poll-q").value.trim();
      var optInputs = document.querySelectorAll(".poll-opt-inp");
      var opts = [];
      optInputs.forEach(function (inp) {
        if (inp.value.trim()) opts.push(inp.value.trim());
      });
      if (!q || opts.length < 2) {
        alert("Please enter a question and at least 2 options.");
        return;
      }
      meetingState.socket.emit("create_new_poll", {
        code: meetingState.code,
        question: q,
        options: opts,
        name: meetingState.userName
      });
      document.getElementById("new-poll-q").value = "";
      optInputs.forEach(function (inp) { inp.value = ""; });
    });
  }

  // 10. Modals Handlers
  var infoTrigger = document.getElementById("meeting-info-trigger");
  if (infoTrigger) {
    infoTrigger.addEventListener("click", function () {
      document.getElementById("direct-invite-url").value = window.location.origin + "/room/" + meetingState.code;
      openModal("modal-meeting-info");
    });
  }

  var btnTopInvite = document.getElementById("btn-top-invite");
  if (btnTopInvite) {
    btnTopInvite.addEventListener("click", function () {
      var inviteUrl = window.location.origin + "/room/" + meetingState.code;
      navigator.clipboard.writeText(inviteUrl).then(function () {
        showToast("📋 Meeting invite link copied!");
      });
    });
  }

  var btnCopyUrl = document.getElementById("btn-copy-invite-url");
  if (btnCopyUrl) {
    btnCopyUrl.addEventListener("click", function () {
      var inp = document.getElementById("direct-invite-url");
      inp.select();
      navigator.clipboard.writeText(inp.value).then(function () {
        showToast("📋 Invite link copied!");
      });
    });
  }

  var btnHostTransferDock = document.getElementById("dock-btn-host-transfer");
  if (btnHostTransferDock) {
    btnHostTransferDock.addEventListener("click", function () {
      populateHostCandidatesModal();
      openModal("modal-host-transfer");
    });
  }

  var btnLeave = document.getElementById("btn-leave-meeting");
  if (btnLeave) {
    btnLeave.addEventListener("click", function () {
      if (confirm("Leave this meeting?")) {
        window.location.href = "/";
      }
    });
  }

  // Search Participants Filter
  var searchInput = document.getElementById("search-participants-input");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      var query = searchInput.value.toLowerCase();
      var rows = document.querySelectorAll(".participant-row");
      rows.forEach(function (r) {
        var name = r.querySelector(".p-full-name").textContent.toLowerCase();
        r.style.display = name.includes(query) ? "flex" : "none";
      });
    });
  }

});
