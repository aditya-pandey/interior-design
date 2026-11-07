// Music for /play/: her songs, played through YouTube's own embedded player (the IFrame Player API),
// so nothing is downloaded or re-hosted. The player stays visible in the music panel while it plays
// (YouTube's terms ask for a visible player of at least 200 x 200 px).
//
// Needs an internet connection; if a video can't be embedded it is skipped and the panel says so.
//
// With her own audio files (pack.tracks: [{ file, title }]) those play instead, through Web Audio, so the
// room audio (roomaudio.js) can place them at the speakers of the room they're playing in.

export class Music {
  constructor(tracks, root, files = []) {
    this.tracks = tracks || [];
    this.files = files;                 // her own audio files: [{ url, title }]
    this.root = root;
    this.i = 0;
    this.player = null;
    this.ready = false;
    this.playing = false;
    this.volume = 70;
    this.onChange = () => {};
    this.titles = {};
  }

  get local() { return this.files.length > 0; }
  // her files: one <audio> element, its stream handed to the room audio
  connect(ctx, room, out) {
    if (!this.local || this.el) return;
    const el = this.el = new Audio();
    el.preload = 'auto'; el.crossOrigin = 'anonymous';
    el.addEventListener('play', () => { this.playing = true; this.error = null; this.onChange(); });
    el.addEventListener('pause', () => { this.playing = false; this.onChange(); });
    el.addEventListener('ended', () => this.next());
    el.addEventListener('error', () => { this.error = 'That song couldn’t be played.'; this.onChange(); });
    this.gain = ctx.createGain(); this.gain.gain.value = this.volume / 100;
    ctx.createMediaElementSource(el).connect(this.gain);
    room.attach(ctx, this.gain, out);
    this.ready = true;
  }
  load() {
    if (this.local) return Promise.resolve();
    if (this.loading || !this.tracks.length) return this.loading;
    this.loading = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { this.error = 'Music needs an internet connection.'; this.onChange(); resolve(); };
      document.head.appendChild(s);
    }).then(() => new Promise((resolve) => {
      if (!window.YT || !window.YT.Player) return resolve();
      this.player = new window.YT.Player(this.root, {
        width: 240, height: 200, videoId: this.tracks[0].id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1, origin: location.origin },
        events: {
          onReady: () => { this.ready = true; this.player.setVolume(this.volume); resolve(); this.onChange(); },
          onStateChange: (e) => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) { this.playing = true; const d = this.player.getVideoData(); if (d?.title) this.titles[this.tracks[this.i].id] = d.title; }
            if (e.data === S.PAUSED) this.playing = false;
            if (e.data === S.ENDED) { this.next(); return; }
            this.error = null;
            this.onChange();
          },
          onError: () => { this.error = 'That one can’t be played here; skipping.'; this.onChange(); setTimeout(() => this.next(), 1200); },
        },
      });
    }));
    return this.loading;
  }

  get title() {
    if (this.local) { const f = this.files[this.i]; return f.title || `Song ${this.i + 1} of ${this.files.length}`; }
    const t = this.tracks[this.i];
    return t ? this.titles[t.id] || `Song ${this.i + 1} of ${this.tracks.length}` : '';
  }

  async play() {
    if (this.local) {
      if (!this.el) this.onNeedAudio?.();
      if (!this.el) return;
      if (!this.el.src) this.el.src = this.files[this.i].url;
      return this.el.play().catch(() => { this.error = 'Tap play to start the music.'; this.onChange(); });
    }
    await this.load(); if (!this.ready) return; this.player.playVideo();
  }
  pause() { if (this.local) { this.el?.pause(); return; } if (this.ready) this.player.pauseVideo(); }
  toggle() { return this.playing ? this.pause() : this.play(); }
  async go(k) {
    if (this.local) {
      this.i = (this.i + k + this.files.length) % this.files.length;
      if (this.el) { this.el.src = this.files[this.i].url; this.el.play().catch(() => {}); }
      this.onChange();
      return;
    }
    await this.load();
    if (!this.ready) return;
    this.i = (this.i + k + this.tracks.length) % this.tracks.length;
    this.player.loadVideoById(this.tracks[this.i].id);
    this.onChange();
  }
  next() { return this.go(1); }
  prev() { return this.go(-1); }
  setVolume(v) { this.volume = v; if (this.local) { if (this.gain) this.gain.gain.value = v / 100; return; } this.applyVolume(); }
  // the YouTube player can only be made louder or quieter: the room audio's level for where she is
  setLevel(k) { this.level = k; if (!this.local) this.applyVolume(); }
  applyVolume() {
    if (!this.ready || this.local) return;
    const v = Math.round(this.volume * (this.level ?? 1));
    if (v !== this.lastVol) { this.lastVol = v; this.player.setVolume(v); }
  }
}
