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
  screenStream: null,
  screenPeers: {},
  pendingVideoUrl: null,
  pendingPlayback: null,
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

  meetingState.socket.on("webrtc_signal", handleWebRTCSignal);

  meetingState.socket.on("screen_share_started", function (data) {
    if (data.sender_id !== meetingState.socket.id) showToast(data.sender_name + " is sharing their screen. Audio requires selecting tab/system audio when prompted.");
  });

  meetingState.socket.on("screen_share_stopped", function (data) {
    if (data.sender_id !== meetingState.socket.id) clearRemoteScreenShare();
  });

  meetingState.socket.on("meeting_state", function (data) {
    meetingState.participants = data.participants || [];
    meetingState.hostSid = data.host_sid;
    renderParticipantsGrid();
    renderParticipantsList();
    renderChat(data.chat || []);
    renderPolls(data.polls || []);
    updatePeopleCount();

    if (data.video_url) loadVideoUrl(data.video_url);
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
    meetingState.pendingPlayback = { action: "play", position: Number(data.position) || 0 };
    applyPendingPlayback();
  });

  meetingState.socket.on("sync_pause", function (data) {
    meetingState.pendingPlayback = { action: "pause", position: Number(data.position) || 0 };
    applyPendingPlayback();
  });

  meetingState.socket.on("sync_seek", function (data) {
    meetingState.pendingPlayback = { action: "seek", position: Number(data.position) || 0 };
    applyPendingPlayback();
  });

  meetingState.socket.on("sync_video_change", function (data) {
    loadVideoUrl(data.url);
    setTheaterViewForSync();
    meetingState.pendingPlayback = { action: "pause", position: 0 };
    applyPendingPlayback();
    showToast("🎬 Trailer loaded for everyone");
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
  var el3 = document.getElementById("meeting-info-people-count");
  if (el1) el1.textContent = count;
  if (el2) el2.textContent = count;
  if (el3) el3.textContent = count + (count === 1 ? " Person Connected" : " People Connected");
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
        var initialUrl = meetingState.pendingVideoUrl || VIDEO_URL_INIT;
        if (extractYouTubeID(initialUrl)) meetingState.player.loadVideoById(extractYouTubeID(initialUrl));
        meetingState.pendingVideoUrl = null;
        applyPendingPlayback();
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
  if (!ytid) {
    showToast("Please use a valid YouTube trailer URL.");
    return;
  }
  meetingState.pendingVideoUrl = url;
  var input = document.getElementById("custom-video-url");
  if (input) input.value = url;
  if (meetingState.player && meetingState.playerReady) {
    meetingState.player.loadVideoById(ytid, 0);
    meetingState.pendingVideoUrl = null;
  }
}

function setTheaterViewForSync() {
  meetingState.currentView = "theater";
  var gallery = document.getElementById("gallery-grid");
  var theater = document.getElementById("theater-mode-view");
  var galleryButton = document.getElementById("btn-view-gallery");
  var theaterButton = document.getElementById("btn-view-theater");
  if (gallery) gallery.style.display = "none";
  if (theater) theater.style.display = "flex";
  if (galleryButton) galleryButton.classList.remove("active");
  if (theaterButton) theaterButton.classList.add("active");
}

function applyPendingPlayback() {
  if (!meetingState.player || !meetingState.playerReady || !meetingState.pendingPlayback) return;
  var action = meetingState.pendingPlayback;
  meetingState.pendingPlayback = null;
  try {
    meetingState.player.seekTo(action.position, true);
    if (action.action === "play") {
      meetingState.player.playVideo();
      meetingState.isPlaying = true;
      updatePlayBtnLabel(true);
    } else if (action.action === "pause") {
      meetingState.player.pauseVideo();
      meetingState.isPlaying = false;
      updatePlayBtnLabel(false);
    }
  } catch (err) {
    console.warn("[YT] Could not apply synchronized playback yet", err);
    meetingState.pendingPlayback = action;
  }
}

// WebRTC screen sharing. Audio is captured only when the browser/selected source permits it.
function sendWebRTCSignal(targetId, payload) {
  meetingState.socket.emit("webrtc_signal", {
    code: meetingState.code,
    target_id: targetId,
    payload: payload
  });
}

function createScreenPeer(peerId) {
  if (meetingState.screenPeers[peerId]) return meetingState.screenPeers[peerId];
  var pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  meetingState.screenPeers[peerId] = pc;
  if (meetingState.screenStream) {
    meetingState.screenStream.getTracks().forEach(function (track) {
      pc.addTrack(track, meetingState.screenStream);
    });
  }
  pc.onicecandidate = function (event) {
    if (event.candidate) sendWebRTCSignal(peerId, { type: "candidate", candidate: event.candidate });
  };
  pc.ontrack = function (event) {
    var video = document.getElementById("remote-screen-video");
    var stage = document.getElementById("remote-screen-share");
    if (video && stage) {
      video.srcObject = event.streams[0];
      stage.style.display = "block";
      video.play().catch(function () {
        showToast("Screen share connected. Tap the shared video to enable playback/audio.");
      });
      var gallery = document.getElementById("gallery-grid");
      var theater = document.getElementById("theater-mode-view");
      if (gallery && theater) {
        gallery.style.display = "none";
        theater.style.display = "flex";
        var galleryButton = document.getElementById("btn-view-gallery");
        var theaterButton = document.getElementById("btn-view-theater");
        if (galleryButton) galleryButton.classList.remove("active");
        if (theaterButton) theaterButton.classList.add("active");
      }
    }
  };
  pc.onconnectionstatechange = function () {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      try { pc.close(); } catch (e) {}
      delete meetingState.screenPeers[peerId];
    }
  };
  return pc;
}

async function handleWebRTCSignal(message) {
  if (!message || !message.payload || message.from_id === meetingState.socket.id) return;
  var pc = createScreenPeer(message.from_id);
  try {
    var payload = message.payload;
    if (payload.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWebRTCSignal(message.from_id, { type: "answer", description: pc.localDescription });
    } else if (payload.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
    } else if (payload.type === "candidate" && payload.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  } catch (error) {
    console.error("[SCREEN SHARE] WebRTC signaling failed", error);
    showToast("Screen connection failed. Stop sharing and try again.");
  }
}

async function startScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    showToast("Screen sharing requires HTTPS and a supported browser.");
    return;
  }
  try {
    meetingState.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 30 } },
      audio: true
    });
    var shareButton = document.getElementById("btn-screen-share");
    if (shareButton) shareButton.textContent = "■ Stop Sharing";
    meetingState.socket.emit("screen_share_started", {
      code: meetingState.code,
      sender_name: meetingState.userName
    });
    meetingState.participants.forEach(async function (person) {
      if (person.id === meetingState.socket.id) return;
      var pc = createScreenPeer(person.id);
      try {
        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendWebRTCSignal(person.id, { type: "offer", description: pc.localDescription });
      } catch (error) {
        console.error("[SCREEN SHARE] Could not create offer", error);
      }
    });
    var videoTrack = meetingState.screenStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.addEventListener("ended", stopScreenShare);
    showToast("Sharing started. In Chrome, choose a tab and enable 'Share tab audio' for sound.");
  } catch (error) {
    if (error.name !== "NotAllowedError") showToast("Could not start screen sharing: " + error.message);
  }
}

function stopScreenShare() {
  if (meetingState.screenStream) {
    meetingState.screenStream.getTracks().forEach(function (track) { track.stop(); });
    meetingState.screenStream = null;
  }
  Object.keys(meetingState.screenPeers).forEach(function (id) {
    try { meetingState.screenPeers[id].close(); } catch (e) {}
    delete meetingState.screenPeers[id];
  });
  var shareButton = document.getElementById("btn-screen-share");
  if (shareButton) shareButton.textContent = "🖥️ Share Screen + Audio";
  meetingState.socket.emit("screen_share_stopped", { code: meetingState.code });
  clearRemoteScreenShare();
}

function clearRemoteScreenShare() {
  var stage = document.getElementById("remote-screen-share");
  var video = document.getElementById("remote-screen-video");
  if (video) {
    if (video.srcObject) video.srcObject.getTracks().forEach(function (track) { track.stop(); });
    video.srcObject = null;
  }
  if (stage) stage.style.display = "none";
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

  // Screen sharing controls
  var shareButton = document.getElementById("btn-screen-share");
  if (shareButton) shareButton.addEventListener("click", function () {
    if (meetingState.screenStream) stopScreenShare();
    else startScreenShare();
  });

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
      if (!url) return;
      if (!extractYouTubeID(url)) {
        showToast("Please use a valid YouTube trailer URL.");
        return;
      }
      // Update the host's own player immediately; do not rely on receiving
      // the server's room broadcast back to the same socket.
      setTheaterViewForSync();
      loadVideoUrl(url);
      meetingState.pendingPlayback = { action: "pause", position: 0 };
      applyPendingPlayback();
      if (meetingState.socket && meetingState.socket.connected) {
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
