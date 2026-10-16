# WatchParty

A synchronized video watch party web application featuring a 10-person conference room layout, real-time video playback synchronization, live chat, movie recommendations, and group polls.

## Prerequisites

- Python 3.9 or higher
- Git

## Setup and Installation Steps

### Step 1: Clone the repository
```bash
git clone https://github.com/gauthamkd/Watchparty.git
cd Watchparty
```

### Step 2: Create a virtual environment

On Windows:
```powershell
python -m venv venv
venv\Scripts\activate
```

On macOS / Linux:
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install required dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Start the application
```bash
python app.py
```

### Step 5: Open the application in your browser
Open your browser and navigate to:
```
http://localhost:5001
```

## How to Use

1. **Host a Watch Party**: Enter your name, optional room name, and a video URL on the landing page, then click Launch.
2. **Join an Existing Party**: Enter the 6-digit room code on the landing page and click Join.
3. **Synchronize Playback**: The host controls play, pause, and seek. Playback state updates automatically for all connected participants.
4. **Browse Movies**: Use the movie recommendation search bar on the landing page to search titles or filter by genre, then click Use in Watch Party.
5. **Interactive Controls**: Use the bottom dock to toggle your microphone, camera, participant list, chat, group polls, or transfer host controls.
