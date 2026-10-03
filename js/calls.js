/* =========================================================
   NOVA — Calls Engine
   File: js/calls.js
   Version: 1.0.0

   Responsibilities:
   - Voice calls
   - Video calls
   - Call state
   - Incoming / outgoing calls
   - Call history
   - Microphone / camera permissions
   - Local media stream
   - Remote media stream
   - WebRTC preparation
   - Signaling preparation
   - Call notifications
   - Mute / camera controls
   - End call

   No fake calls.
   No fake participants.
   No fake call history.
   ========================================================= */

(() => {
  "use strict";

  const CONFIG =
    window.APP_CONFIG || {};

  const APP =
    window.APP || {};

  const DEBUG =
    CONFIG.development?.debug === true;

  const log = (...args) => {
    if (DEBUG) {
      console.info(
        "[NOVA CALLS]",
        ...args
      );
    }
  };

  const warn = (...args) => {
    if (DEBUG) {
      console.warn(
        "[NOVA CALLS]",
        ...args
      );
    }
  };

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */

  const state = {
    initialized: false,

    activeCall: null,

    callType: null,

    status: "idle",

    localStream: null,

    remoteStream: null,

    peerConnection: null,

    callHistory: [],

    isMuted: false,

    cameraEnabled: true,

    speakerEnabled: true,

    microphonePermission: "unknown",

    cameraPermission: "unknown",

    elapsedSeconds: 0,

    timer: null,

    realtime: {
      enabled:
        CONFIG.realtime?.enabled === true,

      connected: false
    },

    signaling: {
      enabled:
        CONFIG.calls?.signaling
          ?.enabled === true
    },

    webrtc: {
      enabled:
        CONFIG.calls?.webrtc
          ?.enabled === true
    }
  };

  window.NOVA_CALLS =
    window.NOVA_CALLS || {};

  window.NOVA_CALLS.state =
    state;

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */

  function $(selector, root = document) {
    return root.querySelector(
      selector
    );
  }

  function $all(
    selector,
    root = document
  ) {
    return Array.from(
      root.querySelectorAll(
        selector
      )
    );
  }

  function featureEnabled(
    feature
  ) {
    if (
      typeof APP.isFeatureEnabled ===
      "function"
    ) {
      return APP.isFeatureEnabled(
        feature
      );
    }

    return true;
  }

  function dispatch(
    name,
    detail = {}
  ) {
    document.dispatchEvent(
      new CustomEvent(
        name,
        {
          detail
        }
      )
    );
  }

  /* ---------------------------------------------------------
     API
     --------------------------------------------------------- */

  function getApiBase() {
    const api =
      CONFIG.api || {};

    return [
      String(
        api.baseURL || "/api"
      ).replace(
        /\/+$/g,
        ""
      ),
      String(
        api.version || "v1"
      ).replace(
        /^\/+|\/+$/g,
        ""
      )
    ]
      .filter(Boolean)
      .join("/");
  }

  function getEndpoint(
    name
  ) {
    return (
      CONFIG.api?.endpoints?.[
        name
      ] || `/${name}`
    );
  }

  function buildApiUrl(
    endpoint,
    id = ""
  ) {
    const cleanEndpoint =
      String(endpoint || "")
        .replace(
          /^\/+/g,
          ""
        )
        .replace(
          /\/+$/g,
          ""
        );

    const cleanId =
      id
        ? String(id)
            .replace(
              /^\/+/g,
              ""
            )
            .replace(
              /\/+$/g,
              ""
            )
        : "";

    return [
      getApiBase(),
      cleanEndpoint,
      cleanId
    ]
      .filter(Boolean)
      .join("/");
  }

  async function apiRequest(
    url,
    options = {}
  ) {
    const timeout =
      CONFIG.api?.timeout ||
      15000;

    const controller =
      new AbortController();

    const timer =
      window.setTimeout(
        () => {
          controller.abort();
        },
        timeout
      );

    const headers = {
      Accept:
        "application/json",
      ...(options.headers || {})
    };

    if (
      options.body &&
      !(options.body instanceof FormData)
    ) {
      headers[
        "Content-Type"
      ] =
        "application/json";
    }

    try {
      const response =
        await fetch(
          url,
          {
            ...options,
            credentials:
              CONFIG.api
                ?.credentials ||
              "include",
            headers,
            signal:
              controller.signal
          }
        );

      const type =
        response.headers.get(
          "content-type"
        ) || "";

      let data = null;

      if (
        type.includes(
          "application/json"
        )
      ) {
        data =
          await response.json();
      } else {
        data =
          await response.text();
      }

      if (!response.ok) {
        const error =
          new Error(
            data?.message ||
              data?.error ||
              `Request failed: ${response.status}`
          );

        error.status =
          response.status;

        error.data =
          data;

        throw error;
      }

      return data;
    } finally {
      window.clearTimeout(
        timer
      );
    }
  }

  /* ---------------------------------------------------------
     Call Type
     --------------------------------------------------------- */

  function normalizeCallType(
    type
  ) {
    return type === "video"
      ? "video"
      : "voice";
  }

  function isCallActive() {
    return [
      "requesting",
      "calling",
      "ringing",
      "connecting",
      "connected"
    ].includes(
      state.status
    );
  }

  /* ---------------------------------------------------------
     Media Permissions
     --------------------------------------------------------- */

  async function checkPermission(
    name
  ) {
    if (
      !navigator.permissions ||
      typeof navigator.permissions
        .query !== "function"
    ) {
      return "unknown";
    }

    try {
      const result =
        await navigator.permissions.query(
          {
            name
          }
        );

      return result.state;
    } catch (_) {
      return "unknown";
    }
  }

  async function updatePermissions(
    callType
  ) {
    state.microphonePermission =
      await checkPermission(
        "microphone"
      );

    if (
      callType === "video"
    ) {
      state.cameraPermission =
        await checkPermission(
          "camera"
        );
    }

    dispatch(
      "nova:call-permissions",
      {
        microphone:
          state.microphonePermission,
        camera:
          state.cameraPermission
      }
    );
  }

  /* ---------------------------------------------------------
     Local Media
     --------------------------------------------------------- */

  async function requestLocalMedia(
    callType
  ) {
    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices
        .getUserMedia !==
        "function"
    ) {
      throw new Error(
        "المتصفح لا يدعم المكالمات الصوتية والفيديو."
      );
    }

    const type =
      normalizeCallType(
        callType
      );

    const constraints = {
      audio: true,
      video:
        type === "video"
          ? {
              facingMode:
                "user"
            }
          : false
    };

    const stream =
      await navigator.mediaDevices.getUserMedia(
        constraints
      );

    state.localStream =
      stream;

    state.isMuted =
      false;

    state.cameraEnabled =
      type === "video";

    attachLocalStream(
      stream
    );

    await updatePermissions(
      type
    );

    dispatch(
      "nova:local-stream-ready",
      {
        stream,
        type
      }
    );

    return stream;
  }

  function attachLocalStream(
    stream
  ) {
    $all(
      "[data-call-local-video]"
    ).forEach(
      (video) => {
        video.srcObject =
          stream;

        video.muted =
          true;

        const promise =
          video.play();

        if (
          promise &&
          typeof promise.catch ===
            "function"
        ) {
          promise.catch(
            () => {}
          );
        }
      }
    );

    $all(
      "[data-call-local-audio]"
    ).forEach(
      (audio) => {
        audio.srcObject =
          stream;

        audio.muted =
          true;

        const promise =
          audio.play();

        if (
          promise &&
          typeof promise.catch ===
            "function"
        ) {
          promise.catch(
            () => {}
          );
        }
      }
    );
  }

  function attachRemoteStream(
    stream
  ) {
    state.remoteStream =
      stream;

    $all(
      "[data-call-remote-video]"
    ).forEach(
      (video) => {
        video.srcObject =
          stream;

        const promise =
          video.play();

        if (
          promise &&
          typeof promise.catch ===
            "function"
        ) {
          promise.catch(
            () => {}
          );
        }
      }
    );

    $all(
      "[data-call-remote-audio]"
    ).forEach(
      (audio) => {
        audio.srcObject =
          stream;

        const promise =
          audio.play();

        if (
          promise &&
          typeof promise.catch ===
            "function"
        ) {
          promise.catch(
            () => {}
          );
        }
      }
    );

    dispatch(
      "nova:remote-stream-ready",
      {
        stream
      }
    );
  }

  function stopLocalMedia() {
    if (
      !state.localStream
    ) {
      return;
    }

    state.localStream
      .getTracks()
      .forEach(
        (track) => {
          try {
            track.stop();
          } catch (_) {}
        }
      );

    state.localStream =
      null;

    $all(
      "[data-call-local-video]"
    ).forEach(
      (video) => {
        video.srcObject =
          null;
      }
    );

    $all(
      "[data-call-local-audio]"
    ).forEach(
      (audio) => {
        audio.srcObject =
          null;
      }
    );
  }

  /* ---------------------------------------------------------
     WebRTC
     --------------------------------------------------------- */

  function createPeerConnection(
    options = {}
  ) {
    if (
      !state.webrtc.enabled
    ) {
      return null;
    }

    if (
      !window.RTCPeerConnection
    ) {
      warn(
        "RTCPeerConnection is not supported."
      );

      return null;
    }

    const configuration =
      options.configuration ||
      {
        iceServers:
          Array.isArray(
            options.iceServers
          )
            ? options.iceServers
            : []
      };

    const peer =
      new RTCPeerConnection(
        configuration
      );

    state.peerConnection =
      peer;

    if (
      state.localStream
    ) {
      state.localStream
        .getTracks()
        .forEach(
          (track) => {
            peer.addTrack(
              track,
              state.localStream
            );
          }
        );
    }

    peer.addEventListener(
      "track",
      (event) => {
        const stream =
          event.streams?.[0];

        if (stream) {
          attachRemoteStream(
            stream
          );
        }
      }
    );

    peer.addEventListener(
      "icecandidate",
      (event) => {
        if (
          event.candidate
        ) {
          sendSignalingMessage(
            {
              type:
                "ice-candidate",
              candidate:
                event.candidate
            }
          );
        }
      }
    );

    peer.addEventListener(
      "connectionstatechange",
      () => {
        handlePeerConnectionState(
          peer.connectionState
        );
      }
    );

    return peer;
  }

  function handlePeerConnectionState(
    connectionState
  ) {
    dispatch(
      "nova:webrtc-state",
      {
        state:
          connectionState
      }
    );

    if (
      connectionState ===
        "connected"
    ) {
      setCallStatus(
        "connected"
      );
      return;
    }

    if (
      [
        "failed",
        "disconnected",
        "closed"
      ].includes(
        connectionState
      )
    ) {
      if (
        isCallActive()
      ) {
        endCall({
          notifyServer:
            true
        });
      }
    }
  }

  async function createOffer() {
    if (
      !state.peerConnection
    ) {
      return null;
    }

    const offer =
      await state.peerConnection.createOffer();

    await state.peerConnection.setLocalDescription(
      offer
    );

    await sendSignalingMessage(
      {
        type: "offer",
        offer
      }
    );

    return offer;
  }

  async function createAnswer() {
    if (
      !state.peerConnection
    ) {
      return null;
    }

    const answer =
      await state.peerConnection.createAnswer();

    await state.peerConnection.setLocalDescription(
      answer
    );

    await sendSignalingMessage(
      {
        type: "answer",
        answer
      }
    );

    return answer;
  }

  async function applyRemoteDescription(
    description
  ) {
    if (
      !state.peerConnection ||
      !description
    ) {
      return false;
    }

    await state.peerConnection.setRemoteDescription(
      description
    );

    return true;
  }

  async function addIceCandidate(
    candidate
  ) {
    if (
      !state.peerConnection ||
      !candidate
    ) {
      return false;
    }

    await state.peerConnection.addIceCandidate(
      candidate
    );

    return true;
  }

  function closePeerConnection() {
    if (
      !state.peerConnection
    ) {
      return;
    }

    try {
      state.peerConnection.close();
    } catch (_) {}

    state.peerConnection =
      null;
  }

  /* ---------------------------------------------------------
     Signaling
     --------------------------------------------------------- */

  async function sendSignalingMessage(
    payload
  ) {
    if (
      !state.signaling.enabled ||
      !state.activeCall?.id
    ) {
      return false;
    }

    try {
      const endpoint =
        `${getEndpoint(
          "calls"
        )}/${state.activeCall.id}/signal`;

      const result =
        await apiRequest(
          buildApiUrl(
            endpoint
          ),
          {
            method: "POST",
            body:
              JSON.stringify(
                payload
              )
          }
        );

      dispatch(
        "nova:signaling-sent",
        {
          payload,
          result
        }
      );

      return true;
    } catch (error) {
      warn(
        "Signaling failed:",
        error
      );

      return false;
    }
  }

  function handleSignalingMessage(
    payload
  ) {
    if (!payload) {
      return;
    }

    switch (
      payload.type
    ) {
      case "offer":
        handleIncomingOffer(
          payload.offer
        );
        break;

      case "answer":
        applyRemoteDescription(
          payload.answer
        ).catch(
          (error) => {
            warn(
              "Remote answer failed:",
              error
            );
          }
        );
        break;

      case "ice-candidate":
        addIceCandidate(
          payload.candidate
        ).catch(
          (error) => {
            warn(
              "ICE candidate failed:",
              error
            );
          }
        );
        break;

      case "call-ended":
        endCall({
          notifyServer:
            false
        });
        break;

      default:
        break;
    }
  }

  async function handleIncomingOffer(
    offer
  ) {
    if (!offer) {
      return;
    }

    try {
      if (
        !state.peerConnection
      ) {
        createPeerConnection();
      }

      await applyRemoteDescription(
        offer
      );

      await createAnswer();
    } catch (error) {
      warn(
        "Incoming offer handling failed:",
        error
      );
    }
  }

  /* ---------------------------------------------------------
     Start Call
     --------------------------------------------------------- */

  async function startCall(
    userId,
    type = "voice",
    options = {}
  ) {
    if (
      !featureEnabled(
        type === "video"
          ? "videoCalls"
          : "voiceCalls"
      )
    ) {
      return {
        success: false,
        reason:
          "feature-disabled"
      };
    }

    if (
      !userId
    ) {
      return {
        success: false,
        reason:
          "user-required"
      };
    }

    if (
      isCallActive()
    ) {
      return {
        success: false,
        reason:
          "call-already-active"
      };
    }

    const callType =
      normalizeCallType(
        type
      );

    state.callType =
      callType;

    setCallStatus(
      "requesting"
    );

    try {
      await requestLocalMedia(
        callType
      );

      const endpoint =
        getEndpoint(
          "calls"
        );

      const result =
        await apiRequest(
          buildApiUrl(
            endpoint
          ),
          {
            method: "POST",
            body:
              JSON.stringify({
                targetUserId:
                  String(
                    userId
                  ),
                type:
                  callType
              })
          }
        );

      const call =
        normalizeCall(
          result?.data ||
            result?.call ||
            result
        );

      if (
        !call?.id
      ) {
        throw new Error(
          "لم يتم إنشاء المكالمة."
        );
      }

      state.activeCall =
        call;

      setCallStatus(
        "calling"
      );

      if (
        state.webrtc.enabled
      ) {
        createPeerConnection(
          options
        );

        await createOffer();
      }

      startTimer();

      updateCallUI();

      dispatch(
        "nova:call-started",
        {
          call
        }
      );

      return {
        success: true,
        call
      };
    } catch (error) {
      warn(
        "Start call failed:",
        error
      );

      await cleanupCall();

      setCallStatus(
        "idle"
      );

      dispatch(
        "nova:call-error",
        {
          type:
            "start",
          error
        }
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ---------------------------------------------------------
     Answer Call
     --------------------------------------------------------- */

  async function answerCall(
    callId,
    type = "voice"
  ) {
    if (
      !callId
    ) {
      return {
        success: false
      };
    }

    const callType =
      normalizeCallType(
        type
      );

    try {
      setCallStatus(
        "requesting"
      );

      await requestLocalMedia(
        callType
      );

      const endpoint =
        `${getEndpoint(
          "calls"
        )}/${callId}/answer`;

      const result =
        await apiRequest(
          buildApiUrl(
            endpoint
          ),
          {
            method: "POST",
            body:
              JSON.stringify({
                type:
                  callType
              })
          }
        );

      state.activeCall =
        normalizeCall(
          result?.data ||
            result?.call ||
            result
        );

      state.callType =
        callType;

      setCallStatus(
        "connecting"
      );

      if (
        state.webrtc.enabled
      ) {
        createPeerConnection();

        if (
          state.activeCall?.offer
        ) {
          await applyRemoteDescription(
            state.activeCall.offer
          );

          await createAnswer();
        }
      }

      startTimer();

      updateCallUI();

      dispatch(
        "nova:call-answered",
        {
          call:
            state.activeCall
        }
      );

      return {
        success: true,
        call:
          state.activeCall
      };
    } catch (error) {
      warn(
        "Answer call failed:",
        error
      );

      await cleanupCall();

      setCallStatus(
        "idle"
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ---------------------------------------------------------
     Reject Call
     --------------------------------------------------------- */

  async function rejectCall(
    callId,
    reason = "rejected"
  ) {
    if (!callId) {
      return {
        success: false
      };
    }

    try {
      const endpoint =
        `${getEndpoint(
          "calls"
        )}/${callId}/reject`;

      await apiRequest(
        buildApiUrl(
          endpoint
        ),
        {
          method: "POST",
          body:
            JSON.stringify({
              reason
            })
        }
      );

      dispatch(
        "nova:call-rejected",
        {
          callId,
          reason
        }
      );

      return {
        success: true
      };
    } catch (error) {
      warn(
        "Reject call failed:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ---------------------------------------------------------
     End Call
     --------------------------------------------------------- */

  async function endCall(
    options = {}
  ) {
    const {
      notifyServer = true
    } = options;

    const callId =
      state.activeCall?.id;

    stopTimer();

    if (
      notifyServer &&
      callId
    ) {
      try {
        const endpoint =
          `${getEndpoint(
            "calls"
          )}/${callId}/end`;

        await apiRequest(
          buildApiUrl(
            endpoint
          ),
          {
            method: "POST",
            body:
              JSON.stringify({
                duration:
                  state.elapsedSeconds
              })
          }
        );
      } catch (error) {
        warn(
          "End call API failed:",
          error
        );
      }
    }

    if (
      callId &&
      state.signaling.enabled
    ) {
      await sendSignalingMessage(
        {
          type:
            "call-ended"
        }
      );
    }

    const endedCall =
      state.activeCall;

    await cleanupCall();

    setCallStatus(
      "ended"
    );

    updateCallUI();

    dispatch(
      "nova:call-ended",
      {
        call:
          endedCall,
        duration:
          state.elapsedSeconds
      }
    );

    /*
     * Return to idle after UI
     * has had a chance to display
     * the ended state.
     */
    window.setTimeout(
      () => {
        if (
          state.status ===
          "ended"
        ) {
          setCallStatus(
            "idle"
          );

          updateCallUI();
        }
      },
      500
    );

    return true;
  }

  /* ---------------------------------------------------------
     Cleanup
     --------------------------------------------------------- */

  async function cleanupCall() {
    stopTimer();

    closePeerConnection();

    stopLocalMedia();

    state.remoteStream =
      null;

    state.activeCall =
      null;

    state.callType =
      null;

    state.isMuted =
      false;

    state.cameraEnabled =
      true;

    $all(
      "[data-call-remote-video]"
    ).forEach(
      (video) => {
        video.srcObject =
          null;
      }
    );

    $all(
      "[data-call-remote-audio]"
    ).forEach(
      (audio) => {
        audio.srcObject =
          null;
      }
    );
  }

  /* ---------------------------------------------------------
     Call Status
     --------------------------------------------------------- */

  function setCallStatus(
    status
  ) {
    state.status =
      String(
        status || "idle"
      );

    document.documentElement.dataset.callStatus =
      state.status;

    $all(
      "[data-call-status]"
    ).forEach(
      (element) => {
        element.textContent =
          getStatusLabel(
            state.status
          );

        element.dataset.status =
          state.status;
      }
    );

    dispatch(
      "nova:call-status",
      {
        status:
          state.status
      }
    );
  }

  function getStatusLabel(
    status
  ) {
    const labels = {
      idle: "جاهز",
      requesting:
        "جارٍ تجهيز المكالمة",
      calling:
        "جارٍ الاتصال",
      ringing:
        "يرن الآن",
      connecting:
        "جارٍ الاتصال",
      connected:
        "متصل",
      ended:
        "انتهت المكالمة"
    };

    return (
      labels[status] ||
      status
    );
  }

  /* ---------------------------------------------------------
     Mute
     --------------------------------------------------------- */

  function toggleMute() {
    if (
      !state.localStream
    ) {
      return false;
    }

    const audioTracks =
      state.localStream.getAudioTracks();

    if (
      audioTracks.length ===
      0
    ) {
      return false;
    }

    state.isMuted =
      !state.isMuted;

    audioTracks.forEach(
      (track) => {
        track.enabled =
          !state.isMuted;
      }
    );

    updateCallControls();

    dispatch(
      "nova:call-mute",
      {
        muted:
          state.isMuted
      }
    );

    return state.isMuted;
  }

  /* ---------------------------------------------------------
     Camera
     --------------------------------------------------------- */

  function toggleCamera() {
    if (
      !state.localStream ||
      state.callType !==
        "video"
    ) {
      return false;
    }

    const videoTracks =
      state.localStream.getVideoTracks();

    if (
      videoTracks.length ===
      0
    ) {
      return false;
    }

    state.cameraEnabled =
      !state.cameraEnabled;

    videoTracks.forEach(
      (track) => {
        track.enabled =
          state.cameraEnabled;
      }
    );

    updateCallControls();

    dispatch(
      "nova:call-camera",
      {
        enabled:
          state.cameraEnabled
      }
    );

    return state.cameraEnabled;
  }

  /* ---------------------------------------------------------
     Speaker
     --------------------------------------------------------- */

  function toggleSpeaker() {
    state.speakerEnabled =
      !state.speakerEnabled;

    $all(
      "[data-call-remote-video], [data-call-remote-audio]"
    ).forEach(
      (element) => {
        element.muted =
          !state.speakerEnabled;
      }
    );

    updateCallControls();

    dispatch(
      "nova:call-speaker",
      {
        enabled:
          state.speakerEnabled
      }
    );

    return state.speakerEnabled;
  }

  /* ---------------------------------------------------------
     Call Timer
     --------------------------------------------------------- */

  function startTimer() {
    stopTimer();

    state.elapsedSeconds =
      0;

    state.timer =
      window.setInterval(
        () => {
          state.elapsedSeconds +=
            1;

          updateTimerUI();

          dispatch(
            "nova:call-timer",
            {
              seconds:
                state.elapsedSeconds
            }
          );
        },
        1000
      );
  }

  function stopTimer() {
    if (
      state.timer
    ) {
      window.clearInterval(
        state.timer
      );

      state.timer =
        null;
    }
  }

  function formatDuration(
    seconds
  ) {
    const value =
      Math.max(
        0,
        Number(
          seconds || 0
        )
      );

    const hours =
      Math.floor(
        value / 3600
      );

    const minutes =
      Math.floor(
        (value % 3600) / 60
      );

    const secs =
      value % 60;

    if (
      hours > 0
    ) {
      return [
        hours,
        minutes,
        secs
      ]
        .map(
          (part) =>
            String(
              part
            ).padStart(
              2,
              "0"
            )
        )
        .join(":");
    }

    return [
      minutes,
      secs
    ]
      .map(
        (part) =>
          String(
            part
          ).padStart(
            2,
            "0"
          )
      )
      .join(":");
  }

  function updateTimerUI() {
    const formatted =
      formatDuration(
        state.elapsedSeconds
      );

    $all(
      "[data-call-timer]"
    ).forEach(
      (element) => {
        element.textContent =
          formatted;
      }
    );
  }

  /* ---------------------------------------------------------
     UI
     --------------------------------------------------------- */

  function updateCallControls() {
    $all(
      "[data-call-mute]"
    ).forEach(
      (button) => {
        button.classList.toggle(
          "is-active",
          state.isMuted
        );

        button.setAttribute(
          "aria-pressed",
          String(
            state.isMuted
          )
        );
      }
    );

    $all(
      "[data-call-camera]"
    ).forEach(
      (button) => {
        button.classList.toggle(
          "is-active",
          !state.cameraEnabled
        );

        button.setAttribute(
          "aria-pressed",
          String(
            !state.cameraEnabled
          )
        );
      }
    );

    $all(
      "[data-call-speaker]"
    ).forEach(
      (button) => {
        button.classList.toggle(
          "is-active",
          state.speakerEnabled
        );

        button.setAttribute(
          "aria-pressed",
          String(
            state.speakerEnabled
          )
        );
      }
    );
  }

  function updateCallUI() {
    document.documentElement.dataset.callType =
      state.callType ||
      "";

    document.documentElement.dataset.callStatus =
      state.status;

    $all(
      "[data-call-type]"
    ).forEach(
      (element) => {
        element.textContent =
          state.callType ===
          "video"
            ? "مكالمة فيديو"
            : "مكالمة صوتية";
      }
    );

    $all(
      "[data-call-user-id]"
    ).forEach(
      (element) => {
        element.textContent =
          state.activeCall
            ?.targetUserId ||
          state.activeCall
            ?.participantId ||
          "";
      }
    );

    updateCallControls();

    updateTimerUI();
  }

  /* ---------------------------------------------------------
     Call History
     --------------------------------------------------------- */

  function normalizeCall(
    call
  ) {
    if (!call) {
      return null;
    }

    return {
      id:
        call.id ||
        call.callId ||
        null,

      type:
        normalizeCallType(
          call.type
        ),

      status:
        call.status ||
        "unknown",

      callerId:
        call.callerId ||
        null,

      targetUserId:
        call.targetUserId ||
        call.recipientId ||
        null,

      participantId:
        call.participantId ||
        null,

      startedAt:
        call.startedAt ||
        null,

      answeredAt:
        call.answeredAt ||
        null,

      endedAt:
        call.endedAt ||
        null,

      duration:
        Number(
          call.duration || 0
        ),

      missed:
        call.missed === true
    };
  }

  async function loadCallHistory(
    options = {}
  ) {
    if (
      !featureEnabled(
        "callHistory"
      )
    ) {
      return [];
    }

    const page =
      Number(
        options.page || 1
      );

    const perPage =
      Number(
        options.perPage ||
          30
      );

    try {
      const endpoint =
        getEndpoint(
          "calls"
        );

      const url =
        buildApiUrl(
          endpoint
        ) +
        `/history?page=${encodeURIComponent(
          page
        )}&perPage=${encodeURIComponent(
          perPage
        )}`;

      const result =
        await apiRequest(
          url,
          {
            method: "GET"
          }
        );

      const raw =
        Array.isArray(
          result
        )
          ? result
          : result?.data ||
            result?.calls ||
            [];

      const calls =
        raw
          .map(
            normalizeCall
          )
          .filter(
            (call) =>
              call?.id
          );

      if (
        page === 1
      ) {
        state.callHistory =
          calls;
      } else {
        state.callHistory =
          [
            ...state.callHistory,
            ...calls
          ];
      }

      renderCallHistory();

      return state.callHistory;
    } catch (error) {
      warn(
        "Call history failed:",
        error
      );

      return [];
    }
  }

  function renderCallHistory() {
    const container =
      $(
        "[data-call-history]"
      );

    if (!container) {
      return;
    }

    if (
      state.callHistory.length ===
      0
    ) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            📞
          </div>

          <h3>
            لا يوجد سجل مكالمات
          </h3>

          <p>
            ستظهر مكالماتك هنا بعد إجراء مكالمات فعلية.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.callHistory
        .map(
          (call) =>
            renderCallHistoryItem(
              call
            )
        )
        .join("");

    bindHistoryActions();
  }

  function renderCallHistoryItem(
    call
  ) {
    const typeLabel =
      call.type ===
      "video"
        ? "مكالمة فيديو"
        : "مكالمة صوتية";

    const icon =
      call.type ===
      "video"
        ? "🎥"
        : "📞";

    const status =
      call.missed
        ? "مكالمة فائتة"
        : call.status;

    return `
      <article
        class="call-history-item"
        data-call-history-id="${escapeHTML(
          call.id
        )}"
      >
        <div class="call-history-item__icon">
          ${icon}
        </div>

        <div class="call-history-item__content">
          <strong>
            ${escapeHTML(
              call.participantId ||
                call.targetUserId ||
                ""
            )}
          </strong>

          <span>
            ${typeLabel}
          </span>
        </div>

        <div class="call-history-item__meta">
          <span>
            ${escapeHTML(
              status
            )}
          </span>

          <span>
            ${formatDuration(
              call.duration
            )}
          </span>
        </div>
      </article>
    `;
  }

  function escapeHTML(
    value
  ) {
    return String(
      value || ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  function bindHistoryActions() {
    $all(
      "[data-call-history-id]"
    ).forEach(
      (element) => {
        if (
          element.dataset
            .novaCallBound ===
          "true"
        ) {
          return;
        }

        element.addEventListener(
          "click",
          () => {
            const id =
              element.dataset
                .callHistoryId;

            dispatch(
              "nova:call-history-open",
              {
                callId:
                  id
              }
            );
          }
        );

        element.dataset
          .novaCallBound =
          "true";
      }
    );
  }

  /* ---------------------------------------------------------
     Incoming Call UI
     --------------------------------------------------------- */

  function showIncomingCall(
    call
  ) {
    if (!call?.id) {
      return;
    }

    const normalized =
      normalizeCall(
        call
      );

    state.activeCall =
      normalized;

    state.callType =
      normalized.type;

    setCallStatus(
      "ringing"
    );

    updateCallUI();

    dispatch(
      "nova:incoming-call",
      {
        call:
          normalized
      }
    );
  }

  /* ---------------------------------------------------------
     Button Bindings
     --------------------------------------------------------- */

  function bindControls() {
    $all(
      "[data-call-mute]"
    ).forEach(
      (button) => {
        if (
          button.dataset
            .novaCallControl ===
          "true"
        ) {
          return;
        }

        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            toggleMute();
          }
        );

        button.dataset
          .novaCallControl =
          "true";
      }
    );

    $all(
      "[data-call-camera]"
    ).forEach(
      (button) => {
        if (
          button.dataset
            .novaCallControl ===
          "true"
        ) {
          return;
        }

        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            toggleCamera();
          }
        );

        button.dataset
          .novaCallControl =
          "true";
      }
    );

    $all(
      "[data-call-speaker]"
    ).forEach(
      (button) => {
        if (
          button.dataset
            .novaCallControl ===
          "true"
        ) {
          return;
        }

        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            toggleSpeaker();
          }
        );

        button.dataset
          .novaCallControl =
          "true";
      }
    );

    $all(
      "[data-call-end]"
    ).forEach(
      (button) => {
        if (
          button.dataset
            .novaCallControl ===
          "true"
        ) {
          return;
        }

        button.addEventListener(
          "click",
          async (event) => {
            event.preventDefault();
            await endCall();
          }
        );

        button.dataset
          .novaCallControl =
          "true";
      }
    );

    $all(
      "[data-call-answer]"
    ).forEach(
      (button) => {
        if (
          button.dataset
            .novaCallControl ===
          "true"
        ) {
          return;
        }

        button.addEventListener(
          "click",
          async (event) => {
            event.preventDefault();

            const call =
              state.activeCall;

            if (!call?.id) {
              return;
            }

            await answerCall(
              call.id,
              call.type
            );
          }
        );

        button.dataset
          .novaCallControl =
          "true";
      }
    );

    $all(
      "[data-call-reject]"
    ).forEach(
      (button) => {
        if (
          button.dataset
            .novaCallControl ===
          "true"
        ) {
          return;
        }

        button.addEventListener(
          "click",
          async (event) => {
            event.preventDefault();

            const call =
              state.activeCall;

            if (!call?.id) {
              return;
            }

            await rejectCall(
              call.id
            );

            await cleanupCall();

            setCallStatus(
              "idle"
            );

            updateCallUI();
          }
        );

        button.dataset
          .novaCallControl =
          "true";
      }
    );
  }

  /* ---------------------------------------------------------
     Realtime Event Binding
     --------------------------------------------------------- */

  function bindRealtimeEvents() {
    document.addEventListener(
      "nova:call-event",
      (event) => {
        const data =
          event.detail;

        if (!data) {
          return;
        }

        if (
          data.type ===
          "incoming"
        ) {
          showIncomingCall(
            data.call
          );
          return;
        }

        if (
          data.type ===
          "signaling"
        ) {
          handleSignalingMessage(
            data.payload
          );
        }
      }
    );
  }

  /* ---------------------------------------------------------
     Initialization
     --------------------------------------------------------- */

  async function init() {
    if (
      state.initialized
    ) {
      return window.NOVA_CALLS;
    }

    state.initialized =
      true;

    if (
      !featureEnabled(
        "voiceCalls"
      ) &&
      !featureEnabled(
        "videoCalls"
      )
    ) {
      log(
        "Calling features are disabled."
      );

      return window.NOVA_CALLS;
    }

    bindControls();

    bindRealtimeEvents();

    updateCallUI();

    const hasHistory =
      Boolean(
        $(
          "[data-call-history]"
        )
      );

    if (
      hasHistory &&
      featureEnabled(
        "callHistory"
      )
    ) {
      await loadCallHistory();
    }

    dispatch(
      "nova:calls-ready",
      {
        state
      }
    );

    log(
      "Calls engine initialized."
    );

    return window.NOVA_CALLS;
  }

  /* ---------------------------------------------------------
     Public API
     --------------------------------------------------------- */

  window.NOVA_CALLS.init =
    init;

  window.NOVA_CALLS.startCall =
    startCall;

  window.NOVA_CALLS.answerCall =
    answerCall;

  window.NOVA_CALLS.rejectCall =
    rejectCall;

  window.NOVA_CALLS.endCall =
    endCall;

  window.NOVA_CALLS.toggleMute =
    toggleMute;

  window.NOVA_CALLS.toggleCamera =
    toggleCamera;

  window.NOVA_CALLS.toggleSpeaker =
    toggleSpeaker;

  window.NOVA_CALLS.requestLocalMedia =
    requestLocalMedia;

  window.NOVA_CALLS.stopLocalMedia =
    stopLocalMedia;

  window.NOVA_CALLS.createPeerConnection =
    createPeerConnection;

  window.NOVA_CALLS.createOffer =
    createOffer;

  window.NOVA_CALLS.createAnswer =
    createAnswer;

  window.NOVA_CALLS.applyRemoteDescription =
    applyRemoteDescription;

  window.NOVA_CALLS.addIceCandidate =
    addIceCandidate;

  window.NOVA_CALLS.handleSignalingMessage =
    handleSignalingMessage;

  window.NOVA_CALLS.showIncomingCall =
    showIncomingCall;

  window.NOVA_CALLS.loadCallHistory =
    loadCallHistory;

  window.NOVA_CALLS.getCallStatus =
    () => state.status;

  window.NOVA_CALLS.isCallActive =
    isCallActive;

  window.NOVA_CALLS.getActiveCall =
    () =>
      state.activeCall;

  window.NOVA_CALLS.formatDuration =
    formatDuration;

  /* ---------------------------------------------------------
     Auto Start
     --------------------------------------------------------- */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        init();
      },
      {
        once: true
      }
    );
  } else {
    init();
  }

})();
