"""
WatchParty - Synchronized Watch Party with Zoom-Style 10-Person Meeting Room
Port: 5001
Author: Gautham
Tech Stack: Python (Flask + Socket.IO) + Vanilla HTML5/CSS/JS (Clean White Modern Theme)
"""

import os
import time
import random
import uuid
import logging
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, jsonify
from flask_socketio import SocketIO, join_room, leave_room, emit

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("watchparty")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-this-secret-before-production")

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    ping_timeout=20,
    ping_interval=10
)

# Only real users connected through Socket.IO are shown in a room.

# Curated Movies with Trailor Links
SAMPLE_MOVIES = [
    {"id": 1, "title": "Interstellar", "year": "2014", "genre": "Sci-Fi", "rating": "8.6", "duration": "2h 49m", "url": "https://www.youtube.com/watch?v=zSWdZVtXT7E", "desc": "A team of explorers travel through a wormhole in space in search of humanity new home."},
    {"id": 2, "title": "Inception", "year": "2010", "genre": "Sci-Fi", "rating": "8.8", "duration": "2h 28m", "url": "https://www.youtube.com/watch?v=YoHD9XEInc0", "desc": "A thief who enters dreams of others to steal corporate secrets gets a reverse mission."},
    {"id": 3, "title": "The Dark Knight", "year": "2008", "genre": "Action", "rating": "9.0", "duration": "2h 32m", "url": "https://www.youtube.com/watch?v=EXeTwQWrcwY", "desc": "Batman faces the Joker, a criminal mastermind who plunges Gotham into anarchy."},
    {"id": 4, "title": "Oppenheimer", "year": "2023", "genre": "Drama", "rating": "8.9", "duration": "3h 00m", "url": "https://www.youtube.com/watch?v=uYPbbksJxIg", "desc": "The story of J. Robert Oppenheimer role in the development of the atomic bomb."},
    {"id": 5, "title": "Dune: Part Two", "year": "2024", "genre": "Sci-Fi", "rating": "8.6", "duration": "2h 46m", "url": "https://www.youtube.com/watch?v=Way9Dexny3w", "desc": "Paul Atreides unites with the Fremen to seek revenge against the conspirators."},
    {"id": 6, "title": "Spider-Man: Across the Spider-Verse", "year": "2023", "genre": "Animation", "rating": "8.7", "duration": "2h 20m", "url": "https://www.youtube.com/watch?v=cqGjhVJWtEg", "desc": "Miles Morales catapults across the Multiverse encountering a team of Spider-People."},
    {"id": 7, "title": "Avengers: Endgame", "year": "2019", "genre": "Action", "rating": "8.4", "duration": "3h 01m", "url": "https://www.youtube.com/watch?v=TcMBFSGVi1c", "desc": "The surviving Avengers assemble one final time to reverse Thanos universe-wide devastation."},
    {"id": 8, "title": "The Matrix", "year": "1999", "genre": "Sci-Fi", "rating": "8.7", "duration": "2h 16m", "url": "https://www.youtube.com/watch?v=vKQi3bBA1y8", "desc": "A computer hacker learns the shocking truth about his reality from mysterious rebels."},
    {"id": 9, "title": "Parasite", "year": "2019", "genre": "Thriller", "rating": "8.5", "duration": "2h 12m", "url": "https://www.youtube.com/watch?v=5xH0HfJHsaY", "desc": "A poor family schemes to become employed by a wealthy family, triggering unexpected chaos."},
    {"id": 10, "title": "Top Gun: Maverick", "year": "2022", "genre": "Action", "rating": "8.3", "duration": "2h 10m", "url": "https://www.youtube.com/watch?v=giXco2jaZ_4", "desc": "Pete Maverick Mitchell returns to train a squad of graduate pilots for a dangerous mission."},
    {"id": 11, "title": "Spirited Away", "year": "2001", "genre": "Animation", "rating": "8.6", "duration": "2h 05m", "url": "https://www.youtube.com/watch?v=ByXuk9QqQkk", "desc": "A young girl wanders into a magical spirit world and must work to free her parents."},
    {"id": 12, "title": "Whiplash", "year": "2014", "genre": "Drama", "rating": "8.5", "duration": "1h 46m", "url": "https://www.youtube.com/watch?v=7d_jQycdQGo", "desc": "A promising young drummer enrolls at a music conservatory under an abusive instructor."},
    {"id": 13, "title": "La La Land", "year": "2016", "genre": "Comedy", "rating": "8.0", "duration": "2h 08m", "url": "https://www.youtube.com/watch?v=0pdqf4P9MB8", "desc": "A jazz pianist and an aspiring actress fall in love while pursuing their Hollywood dreams."},
    {"id": 14, "title": "Gladiator II", "year": "2024", "genre": "Action", "rating": "7.9", "duration": "2h 28m", "url": "https://www.youtube.com/watch?v=4rgYUipGJNo", "desc": "Years after Maximus sacrifice, Lucius enters the Colosseum to restore Rome former glory."},
    {"id": 15, "title": "Pulp Fiction", "year": "1994", "genre": "Thriller", "rating": "8.9", "duration": "2h 34m", "url": "https://www.youtube.com/watch?v=s7EdQ4FqbhY", "desc": "The lives of two mob hitmen, a boxer, and a gangster wife intertwine in four tales of violence."},
    {"id": 16, "title": "Everything Everywhere All at Once", "year": "2022", "genre": "Sci-Fi", "rating": "7.8", "duration": "2h 19m", "url": "https://www.youtube.com/watch?v=wxN1T1uxQ2g", "desc": "A middle-aged immigrant is swept into an insane adventure connecting parallel universe lives."}
]

# Rooms store
rooms = {}


def generate_6digit_code():
    """Generates a realistic random 6-digit room code (e.g., 739482)."""
    return str(random.randint(100000, 999999))


def current_time_seconds():
    return time.time()


def calculate_position(room):
    """Calculates server-authoritative playback position dynamically."""
    state = room["state"]
    if state["playing"]:
        elapsed = current_time_seconds() - state["server_ts"]
        return max(0.0, state["position"] + elapsed)
    return max(0.0, state["position"])


# ---------------------------------------------------------------------------
# HTTP Endpoints
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Zoom-style Clean White Landing Page"""
    suggested_code = generate_6digit_code()
    return render_template("index.html", suggested_code=suggested_code, movies=SAMPLE_MOVIES)


@app.route("/create", methods=["POST"])
def create_room():
    """Create a new 10-person meeting room with random 6-digit code."""
    host_name = request.form.get("host_name", "Gautham").strip() or "Gautham"
    room_name = request.form.get("room_name", f"{host_name}'s Watch Party").strip()
    video_url = request.form.get("video_url", "https://www.youtube.com/watch?v=zSWdZVtXT7E").strip()
    
    # Use the exact 6-digit code presented to the user on the landing page
    code = request.form.get("room_code", "").strip()
    if not code or len(code) != 6 or not code.isdigit() or code in rooms:
        code = generate_6digit_code()
        while code in rooms:
            code = generate_6digit_code()

    # Participants are added only when real browsers connect via Socket.IO.
    initial_participants = {}

    rooms[code] = {
        "code": code,
        "name": room_name,
        "host_name": host_name,
        "host_sid": None,
        "video_url": video_url,
        "created_at": datetime.now().strftime("%I:%M %p"),
        "state": {
            "playing": False,
            "position": 0.0,
            "server_ts": current_time_seconds()
        },
        "participants": initial_participants,
        "chat": [
            {"name": "System", "text": f"Welcome to {room_name}! Share the invite link to bring others in.", "time": "Just now", "is_sys": True}
        ],
        "polls": [],
        "playlist": [
            {"title": "Interstellar Official Trailer", "url": "https://www.youtube.com/watch?v=zSWdZVtXT7E", "added_by": host_name}
        ]
    }

    logger.info(f"[ROOM CREATED] Code: {code} | Host: {host_name} | Waiting for real participants")
    return redirect(url_for("room", code=code, name=host_name, is_host="1"))


@app.route("/join", methods=["POST"])
def join_room_view():
    """Join an existing 6-digit meeting."""
    code = request.form.get("room_code", "").strip()
    user_name = request.form.get("user_name", "Friend").strip() or "Friend"

    if code not in rooms:
        return render_template("index.html", suggested_code=generate_6digit_code(),
                               movies=SAMPLE_MOVIES, error=f"Meeting code {code} not found. Please check and try again.")

    return redirect(url_for("room", code=code, name=user_name, is_host="0"))


@app.route("/room/<code>")
def room(code):
    """Zoom-style Meeting Room."""
    if code not in rooms:
        return redirect(url_for("index"))

    r = rooms[code]
    return render_template(
        "room.html",
        code=code,
        room_name=r["name"],
        user_name=request.args.get("name", "Gautham"),
        is_host=request.args.get("is_host", "0"),
        video_url=r["video_url"],
        host_name=r["host_name"],
        movies=SAMPLE_MOVIES
    )


# ---------------------------------------------------------------------------
# Socket.IO Real-time Synchronization
# ---------------------------------------------------------------------------

@socketio.on("join_meeting")
def handle_join_meeting(data):
    code = data.get("code")
    name = data.get("name", "User")
    is_host = data.get("is_host", False)
    sid = request.sid

    if code not in rooms:
        emit("error_msg", {"msg": "Meeting room expired or invalid"})
        return

    join_room(code)
    room = rooms[code]

    # Map actual socket to host or participant
    if is_host and (room["host_sid"] is None or room["host_sid"] == "host_placeholder"):
        room["host_sid"] = sid
        if "host_placeholder" in room["participants"]:
            del room["participants"]["host_placeholder"]
        room["participants"][sid] = {
            "id": sid,
            "name": f"{name} (Host, me)",
            "avatar": name[:2].upper(),
            "bg": "#2563eb",
            "is_host": True,
            "role": "Host",
            "audio": True,
            "video": True,
            "is_bot": False,
        }
    else:
        room["participants"][sid] = {
            "id": sid,
            "name": name,
            "avatar": name[:2].upper(),
            "bg": "#3b82f6",
            "is_host": False,
            "role": "Participant",
            "audio": True,
            "video": True,
            "is_bot": False,
        }

    cur_pos = calculate_position(room)

    # Deliver full meeting state to user
    emit("meeting_state", {
        "code": code,
        "room_name": room["name"],
        "host_sid": room["host_sid"],
        "video_url": room["video_url"],
        "playback": {
            **room["state"],
            "position": cur_pos,
        },
        "participants": list(room["participants"].values()),
        "chat": room["chat"],
        "polls": room["polls"],
        "playlist": room["playlist"]
    })

    # Broadcast updated participant list to all in room
    emit("update_participants", {"participants": list(room["participants"].values())}, to=code)


@socketio.on("disconnect")
def handle_disconnect(reason=None):
    sid = request.sid
    for code, room_data in list(rooms.items()):
        if sid in room_data["participants"]:
            participant = room_data["participants"].pop(sid)
            if room_data.get("host_sid") == sid:
                room_data["host_sid"] = None
                remaining = list(room_data["participants"].values())
                if remaining:
                    new_host = remaining[0]
                    new_host["is_host"] = True
                    new_host["role"] = "Host"
                    room_data["host_sid"] = new_host["id"]
                    room_data["host_name"] = new_host["name"]
                    socketio.emit("host_changed", {
                        "new_host_id": new_host["id"],
                        "new_host_name": new_host["name"]
                    }, to=code)
            socketio.emit("update_participants", {
                "participants": list(room_data["participants"].values())
            }, to=code)
            socketio.emit("new_chat_message", {
                "name": "System",
                "text": f"{participant['name']} left the party.",
                "time": datetime.now().strftime("%I:%M %p"),
                "is_sys": True
            }, to=code)
            break


@socketio.on("play_video")
def handle_play(data):
    code = data.get("code")
    if code not in rooms:
        return
    room = rooms[code]
    now = current_time_seconds()
    pos = float(data.get("position", calculate_position(room)))

    room["state"].update({"playing": True, "position": pos, "server_ts": now})
    emit("sync_play", {"position": pos, "server_ts": now}, to=code)


@socketio.on("pause_video")
def handle_pause(data):
    code = data.get("code")
    if code not in rooms:
        return
    room = rooms[code]
    now = current_time_seconds()
    pos = calculate_position(room)

    room["state"].update({"playing": False, "position": pos, "server_ts": now})
    emit("sync_pause", {"position": pos, "server_ts": now}, to=code)


@socketio.on("seek_video")
def handle_seek(data):
    code = data.get("code")
    if code not in rooms:
        return
    room = rooms[code]
    now = current_time_seconds()
    pos = float(data.get("position", 0.0))

    room["state"].update({"position": pos, "server_ts": now})
    emit("sync_seek", {"position": pos, "server_ts": now}, to=code)


@socketio.on("change_video_url")
def handle_change_url(data):
    code = data.get("code")
    if code not in rooms:
        return
    room = rooms[code]
    url = data.get("url", "").strip()
    if url:
        room["video_url"] = url
        room["state"].update({"playing": False, "position": 0.0, "server_ts": current_time_seconds()})
        emit("sync_video_change", {"url": url}, to=code)


@socketio.on("chat_message")
def handle_chat(data):
    code = data.get("code")
    if code not in rooms:
        return

    msg = {
        "name": data.get("name", "Gautham"),
        "text": data.get("text", "")[:500],
        "time": datetime.now().strftime("%I:%M %p"),
        "is_me": (request.sid == rooms[code]["host_sid"])
    }
    rooms[code]["chat"].append(msg)
    emit("new_chat_message", msg, to=code)


@socketio.on("send_reaction")
def handle_reaction(data):
    code = data.get("code")
    if code not in rooms:
        return

    emit("show_reaction", {
        "emoji": data.get("emoji", "❤️"),
        "sender": data.get("name", "Friend"),
        "target_id": data.get("target_id")
    }, to=code)


@socketio.on("transfer_host")
def handle_transfer_host(data):
    code = data.get("code")
    if code not in rooms:
        return
    room = rooms[code]
    target_id = data.get("target_id")

    for p in room["participants"].values():
        if p["id"] == target_id:
            # Transfer host role
            old_host = room["host_sid"]
            if old_host in room["participants"]:
                room["participants"][old_host]["is_host"] = False
                room["participants"][old_host]["role"] = "Participant"
            p["is_host"] = True
            p["role"] = "Host"
            room["host_sid"] = target_id
            room["host_name"] = p["name"]

            emit("host_changed", {
                "new_host_id": target_id,
                "new_host_name": p["name"]
            }, to=code)
            emit("update_participants", {"participants": list(room["participants"].values())}, to=code)
            break


@socketio.on("submit_vote")
def handle_vote(data):
    code = data.get("code")
    if code not in rooms:
        return
    poll_id = data.get("poll_id")
    option = data.get("option")
    voter = data.get("voter_id", request.sid)

    for poll in rooms[code]["polls"]:
        if poll["id"] == poll_id:
            for opt in poll["votes"]:
                if voter in poll["votes"][opt]:
                    poll["votes"][opt].remove(voter)
            if option in poll["votes"]:
                poll["votes"][option].append(voter)
            emit("update_poll", poll, to=code)
            break


@socketio.on("create_new_poll")
def handle_new_poll(data):
    code = data.get("code")
    if code not in rooms:
        return

    new_poll = {
        "id": f"poll_{len(rooms[code]['polls']) + 1}",
        "question": data.get("question", "Quick Poll"),
        "options": data.get("options", ["Yes", "No"]),
        "votes": {opt: [] for opt in data.get("options", ["Yes", "No"])},
        "created_by": data.get("name", "Host"),
        "active": True
    }
    rooms[code]["polls"].append(new_poll)
    emit("poll_created", new_poll, to=code)


if __name__ == "__main__":
    print("=" * 65)
    print("   WATCHPARTY (9-PERSON WHITE EDITION) IS RUNNING!")
    port = int(os.environ.get("PORT", "5001"))
    print(f"   Port: {port}")
    print(f"   Open in browser: http://localhost:{port}")
    print("=" * 65)
    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
