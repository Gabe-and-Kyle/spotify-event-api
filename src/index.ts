import axios from "axios";
import { EventEmitter } from "events";
import * as crypto from "crypto";
import * as qs from "querystring";
import { parse } from "path";

const API_URL = "https://api.spotify.com/v1/me";

class MyEmitter extends EventEmitter {}

/**
 * Subscribe to events.
 * `event.on("newSong", callback)`
 */

interface Credentials {
  client_id: string;
  redirect_uri: string;
  scopes: string[];
  access_token: string;
  refresh_token: string;
}

interface Track {
  uri: string;
  artists: string[];
  album_uri: string;
  device_id: string;
  is_playing: boolean;
  shuffle_state: boolean;
  repeat_state: string;
  volume: number;
  type: string;
  context: Object;
}

export class Player {
  event = new MyEmitter();
  timer: any = null;
  codeVerifier: string;
  codeState: string;
  codeChallenge: string;
  eventList: any = [
    "update-song",
    "update-album",
    "update-device",
    "update-playing-state",
    "update-shuffle-state",
    "update-repeat-state",
    "update-volume",
    "update-playing-type",
  ];
  credentials: Credentials = {
    client_id: "",
    redirect_uri: "",
    scopes: [],
    access_token: "",
    refresh_token: "",
  };
  songHolder: Track = {
    uri: "",
    artists: [],
    album_uri: "",
    device_id: "",
    is_playing: false,
    shuffle_state: false,
    repeat_state: "off",
    volume: 0,
    type: "track",
    context: {},
  };
  playerData: any = {};

  /**
   *
   * @param params Optional object. 'client_id', 'redirect_uri', 'scopes'
   */
  constructor(params?: any) {
    if (params) {
      (this.credentials.client_id = params.client_id),
        (this.credentials.redirect_uri = params.redirect_uri),
        (this.credentials.scopes = params.scopes);
    }

    this.codeVerifier = base64URLEncode(crypto.randomBytes(32));
    this.codeState = base64URLEncode(crypto.randomBytes(32));
    this.codeChallenge = base64URLEncode(sha256(this.codeVerifier));
  }

  async _get(path: string, query?: any) {
    const config = {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.getAccessToken()}`,
      },
    };
    let url = API_URL + path;
    if (query) url += qs.stringify(query);
    return await axios.get(url, config);
  }

  async _put(path: string, data?: any) {
    const config = {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.getAccessToken()}`,
      },
    };
    let url = API_URL + path;
    return await axios.put(url, data, config);
  }

  async _post(path: string, data?: any) {
    const config = {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.getAccessToken()}`,
      },
    };
    let url = API_URL + path;
    return await axios.post(url, qs.stringify(data), config);
  }

  setAccessToken(token: string) {
    this.credentials.access_token = token;
  }

  setRefreshToken(token: string) {
    this.credentials.refresh_token = token;
  }

  getAccessToken() {
    return this.credentials.access_token;
  }

  getRefreshToken() {
    return this.credentials.refresh_token;
  }

  /**
   * @returns Formatted Spotify url with redirect
   */
  getAuthUrl() {
    let authUrl: string;
    authUrl =
      "https://accounts.spotify.com/authorize" +
      `?response_type=code&client_id=${this.credentials.client_id}&redirect_uri=${this.credentials.redirect_uri}&` +
      `scope=${this.credentials.scopes}&state=${this.codeState}&code_challenge=${this.codeChallenge}&code_challenge_method=S256`;

    return authUrl;
  }

  getSavedUserData() {
    return this.songHolder;
  }

  getSavedPlayerData() {
    return this.playerData;
  }

  eventListener(callback: any) {
    for (let e of this.eventList) {
      this.event.on(e, (res) => {
        callback(e, res);
      });
    }
  }

  /**
   * Async. Emits on channel 'Tokens' when completed
   * @param callback Callback function
   * @param code Authorization code from Spotify
   */
  async getTokensFromCode(code: string, callback?: any) {
    let config = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };
    let requestBody = {
      client_id: this.credentials.client_id,
      grant_type: "authorization_code",
      code: code,
      redirect_uri: this.credentials.redirect_uri,
      code_verifier: this.codeVerifier,
    };

    return await axios
      .post(
        "https://accounts.spotify.com/api/token",
        qs.stringify(requestBody),
        config
      )
      .then((response: any) => {
        this.setAccessToken(response.data.access_token);
        this.setRefreshToken(response.data.refresh_token);
        if (callback) callback(response.data);
      })
      .catch((err: any) => {
        throw err;
      });
  }

  /**
   * @param callback Callback function
   * @returns GET /player, callback(data)
   */
  async getCurrentlyPlaying(callback?: any) {
    let data: any;
    data = await this._get("/player")
      .then((res) => {
        if (res.status == 200) {
          this.playerData = res.data;

          if (callback) callback(res.data);
        } else {
          if (callback) callback("");
        }
      })
      .catch((error) => {
        console.log(error);
      });
    return data;
  }

  /**
   * @param callback Callback function
   * @returns GET /player/devices
   */
  async getUserDevices(callback?: any) {
    let data: any;
    data = await this._get("/player/devices")
      .then((res) => {
        for (let i = 0; i < res.data.devices.length; i++) {
          if (res.data.devices[i].is_active) {
            this.songHolder.device_id = res.data.devices[i].id;
            this.songHolder.volume = res.data.devices[i].volume_percent;
          }
        }
        if (callback) callback(res.data);
      })
      .catch((error) => {
        console.error(error.response.data);
      });
    return data;
  }

  /**
   *
   * @param callback Callback function
   * @returns GET /playlists, callback(data)
   */
  async getUserPlaylists(callback?: any) {
    let data: any;
    data = await this._get("/playlists")
      .then((res) => {
        if (callback) callback(res.data);
      })
      .catch((error) => {
        console.error(error.response.data);
      });
    return data;
  }

  /**
   *
   * @param playlist_id
   * @param callback
   */
  async getPlaylist(playlist_id: string, callback?: any) {
    let data: any;
    data = await this._get(`/playlists/${playlist_id}`)
      .then((res) => {
        if (callback) callback(res.data);
      })
      .catch((error) => {
        console.error(error.response.data);
      });
    return data;
  }

  /**
   *
   * @param id
   */
  async setDevice(id: string, callback?: any) {
    let data: any;
    let body = {
      device_ids: [id],
    };

    data = await this._put("/player/", body)
      .then((res) => {
        if (callback) callback(res.data);
      })
      .catch((error) => {
        console.error(error.response.data);
      });
    return data;
  }

  async addToUserQueue(body: any) {
    let data: void
    let url = '/player/queue/?' + qs.stringify(body)
    data = await this._post(url)
    .then(() => {})
    .catch(error => {
      console.error(error.response.data)
    })
    return data
  }

  async play() {
    let url = '/player/play'
    let data = await this._put(url)
    .then(() => {})
    .catch(error => {
      console.error(error.response.data)
    })
    return data
  }

  async pause() {
    let url = '/player/pause'
    let data = await this._put(url)
    .then(() => {})
    .catch(error => {
      console.error(error.response.data)
    })
    return data
  }

  async skip() {
    let url = '/player/next'
    let data = await this._post(url)
    .then(() => {})
    .catch(error => {
      console.error(error.response.data)
    })
    return data
  }

  async previous() {
    let url = '/player/previous'
    let data = await this._post(url)
    .then(() => {})
    .catch(error => {
      console.error(error.response.data)
    })
    return data
  }

  async repeat(state: string) {
    let url = '/player/repeat?' + qs.stringify({state: state})
    let data = await this._put(url)
    .catch(error => {
      console.error(error.response.data)
    })
    return data
  }

  async shuffle(state: boolean) {
    let url = '/player/shuffle?' + qs.stringify({state: state})
    let data = await this._put(url)
    .then(() => {})
    .catch(error => {
      console.error(error.response.data)
    })
    return data
  }

  async togglePlayback() {
    this.getCurrentlyPlaying((response: any) => {
      if (response.is_playing === true)
        this.pause()
      else
        this.play()
    })
  }

  async toggleRepeat() {
    this.getCurrentlyPlaying((response: any) => {
      switch (response.repeat_state) {
        case 'off':
          this.repeat('context')
          break;
        case 'context':
          this.repeat('track')
          break;
        case 'track':
          this.repeat('off')
      }
    })
  }

  async toggleShuffle() {
    this.getCurrentlyPlaying((response: any) => {
      this.shuffle(!response.shuffle_state)
    })
  }

  async setVolume(value: number) {
    let url = '/player/volume?' + qs.stringify({volume_percent: value})
    let data = this._put(url)
    .then(() => {})
    .catch(error => {
      console.error(error.response.data)
    })
    return data
  }

  /**
   * Starts timer, emits changes
   * @param delay Time to refresh in ms. Default 1000ms
   */
  begin(delay: number = 1000) {
    clearInterval(this.timer);
    this.timer = null;
    if (this.getAccessToken() != "") {
      this.getCurrentlyPlaying((res: any) => {
        if (res != "") {
          for (let e of this.eventList) {
            this.event.emit(e, res);
          }
          this.songHolder = parseSpotifyResponse(res);
        } else {
          for (let e of this.eventList) {
            this.event.emit(e, "");
          }
        }
      });

      if (this.timer == null)
        this.timer = setInterval(() => {
          this.getCurrentlyPlaying((res: any) => {
            if (res != "") {
              if (res.item.uri != this.songHolder.uri)
                this.event.emit("update-song", res);
              if (res.item.album.uri != this.songHolder.album_uri)
                this.event.emit("update-album", res);
              if (res.device.id != this.songHolder.device_id)
                this.event.emit("update-device", res);
              if (res.is_playing != this.songHolder.is_playing)
                this.event.emit("update-playing-state", res);
              if (res.shuffle_state != this.songHolder.shuffle_state)
                this.event.emit("update-shuffle-state", res);
              if (res.repeat_state != this.songHolder.repeat_state)
                this.event.emit("update-repeat-state", res);
              if (res.device.volume_percent != this.songHolder.volume)
                this.event.emit("update-volume", res);
              if (res.currently_playing_type != this.songHolder.type)
                this.event.emit("update-playing-type", res);
              this.event.emit('progress-percent', res.progress_ms / res.item.duration_ms)

              this.songHolder = parseSpotifyResponse(res)
            } else {
              for (let e of this.eventList) {
                this.event.emit(e, "");
                this.songHolder = {
                  uri: "",
                  artists: [],
                  album_uri: "",
                  device_id: "",
                  is_playing: false,
                  shuffle_state: false,
                  repeat_state: "off",
                  volume: 0,
                  type: "track",
                  context: {},
                };
              }
            }
          });
        }, delay);
    } else {
      console.error("Access token not set!");
    }
  }

  /**
   * Stop timer (and kill program)
   */
  stop() {
    clearInterval(this.timer);
  }

}

  /**
   * Stop timer (and kill program)
   */
  stop() {
    clearInterval(this.timer);
  }
}

function sha256(str: string) {
  return crypto.createHash("sha256").update(str).digest();
}

function base64URLEncode(str: Buffer) {
  return str
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function parseSpotifyResponse(data: any) {
  return {
    uri: data.item.uri,
    artists: data.item.artists,
    album_uri: data.item.album.uri,
    device_id: data.device.id,
    is_playing: data.is_playing,
    shuffle_state: data.shuffle_state,
    repeat_state: data.repeat_state,
    volume: data.device.volume_percent,
    type: data.currently_playing_type,
    context: data.context,
  };
}
