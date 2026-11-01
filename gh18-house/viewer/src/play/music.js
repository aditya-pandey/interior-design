// Music for /play/: her songs, played through YouTube's own embedded player (the IFrame Player API),
// so nothing is downloaded or re-hosted. The player stays visible in the music panel while it plays
// (YouTube's terms ask for a visible player of at least 200 x 200 px).
//
// Needs an internet connection; if a video can't be embedded it is skipped and the panel says so.

export class Music {
  constructor(tracks, root) {
    this.tracks = tracks || [];
    this.root = root;
    this.i = 0;
    this.player = null;
    this.ready = false;
    this.playing = false;
    this.volume = 70;
    this.onChange = () => {};
    this.titles = {};
  }

  load() {
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
    const t = this.tracks[this.i];
    return t ? this.titles[t.id] || `Song ${this.i + 1} of ${this.tracks.length}` : '';
  }

  async play() { await this.load(); if (!this.ready) return; this.player.playVideo(); }
  pause() { if (this.ready) this.player.pauseVideo(); }
  toggle() { return this.playing ? this.pause() : this.play(); }
  async go(k) {
    await this.load();
    if (!this.ready) return;
    this.i = (this.i + k + this.tracks.length) % this.tracks.length;
    this.player.loadVideoById(this.tracks[this.i].id);
    this.onChange();
  }
  next() { return this.go(1); }
  prev() { return this.go(-1); }
  setVolume(v) { this.volume = v; if (this.ready) this.player.setVolume(v); }
}
