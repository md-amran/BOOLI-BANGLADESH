// Agora Configuration
const AGORA_CONFIG = {
  appId: "7d58adc98a384c2aa1fb401d025a3997",
};

// Call Window URL
const CALL_WINDOW_URL = './call-window.html';

class CallManager {
  constructor() {
    this.client = null;
    this.localTracks = null;
    this.currentCallType = null;
    this.isCallActive = false;
    this.isMuted = false;
    this.isCameraOn = true;
    this.callStartTime = null;
    this.callTimer = null;
    this.currentRoomId = null;
    this.currentCalleeName = null;
    this.currentCalleeId = null;
    this.callDuration = 0;
    this.callWindow = null;
    this.isInitiator = false;
    this.callStatusListener = null;
    this.callAccepted = false;
    this.callRejected = false;
    this.callEnded = false;
    this.ringtoneAudio = null;
    this.incomingCallModal = null;
    this.popupCheckInterval = null;
    this.callTimeoutId = null;
    this.incomingCallListener = null;
    this.isScreenSharing = false;
    this.screenTrack = null;
    this.callAttempts = new Map(); // Track call attempts per user
  }

  // Initialize Agora
  async initAgora() {
    if (this.client) {
      // Clean up existing client first
      try {
        await this.cleanupCall();
      } catch(e) {}
      this.client = null;
    }

    try {
      this.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      console.log("✅ Agora client created");
      return true;
    } catch (error) {
      console.error("Failed to initialize Agora:", error);
      this.showToast("Failed to initialize call service", "error");
      return false;
    }
  }

  showToast(msg, type = 'info') {
    if (window.toast) {
      window.toast(msg, type);
    } else {
      console.log(`${type}: ${msg}`);
      alert(msg);
    }
  }

  generateRoomId(callerId, calleeId) {
    const timestamp = Date.now();
    return `room_${timestamp}_${callerId.slice(-4)}`;
  }

  openCallPopup(roomId, callType, contactName, isInitiator, calleeId = null) {
    const callData = {
      roomId: roomId,
      callType: callType,
      contactName: contactName,
      isInitiator: isInitiator,
      callerId: state.user.uid,
      callerName: state.user.displayName || state.user.email,
      calleeId: calleeId || state.currentContact?.id,
      appId: AGORA_CONFIG.appId,
      timestamp: Date.now()
    };
    
    localStorage.setItem('booli_call_data', JSON.stringify(callData));
    console.log("📦 Call data stored");

    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const popupWidth = 400;
    const popupHeight = 600;
    const left = (screenWidth - popupWidth) / 2;
    const top = (screenHeight - popupHeight) / 2;

    const features = [
      `width=${popupWidth}`,
      `height=${popupHeight}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=no',
      'toolbar=no',
      'location=no',
      'menubar=no',
      'status=no',
      'titlebar=yes',
      'alwaysOnTop=yes'
    ].join(',');

    try {
      this.callWindow = window.open(CALL_WINDOW_URL, `booli_call_${roomId}`, features);
      
      if (!this.callWindow) {
        this.showToast("Please allow popups for this site to make calls", "error");
        return false;
      }

      this.callWindow.focus();

      this.popupCheckInterval = setInterval(() => {
        if (this.callWindow && this.callWindow.closed) {
          clearInterval(this.popupCheckInterval);
          this.popupCheckInterval = null;
          console.log("Call popup closed by user");
          if (this.isCallActive && !this.callEnded) {
            this.endCall();
          }
        }
      }, 500);

      return true;
    } catch (error) {
      console.error("Failed to open call popup:", error);
      this.showToast("Failed to open call window", "error");
      return false;
    }
  }

  // Start a call - FIXED for multiple calls
  async startCall(calleeId, calleeName, callType) {
    if (!state.user) {
      this.showToast("Please login first", "error");
      return;
    }
    
    // Check if already in a call
    if (this.isCallActive || this.callAccepted || !this.callEnded === false && this.currentRoomId) {
      this.showToast("You are already in a call. Please end the current call first.", "error");
      return;
    }
    
    // Clean up any existing call state
    await this.cleanupCall();
    
    const initialized = await this.initAgora();
    if (!initialized) return;

    this.currentCallType = callType;
    this.currentCalleeName = calleeName;
    this.currentCalleeId = calleeId;
    this.currentRoomId = this.generateRoomId(state.user.uid, calleeId);
    this.isInitiator = true;
    this.callAccepted = false;
    this.callRejected = false;
    this.callEnded = false;
    this.isCallActive = false;
    
    console.log("📡 Room ID:", this.currentRoomId);
    console.log("📞 Starting call to:", calleeName);

    try {
      const { db, doc, setDoc, serverTimestamp } = FB();
      const callRef = doc(db, 'calls', this.currentRoomId);
      
      await setDoc(callRef, {
        callerId: state.user.uid,
        callerName: state.user.displayName || state.user.email,
        calleeId: calleeId,
        calleeName: calleeName,
        callType: callType,
        status: 'ringing',
        roomId: this.currentRoomId,
        startedAt: serverTimestamp(),
        createdAt: Date.now()
      });
      console.log("✅ Call info stored in Firebase");

      const opened = this.openCallPopup(this.currentRoomId, callType, calleeName, true, calleeId);
      if (!opened) return;
      
      this.listenForCallResponse(this.currentRoomId);
      
      // Clear any existing timeout
      if (this.callTimeoutId) {
        clearTimeout(this.callTimeoutId);
      }
      
      this.callTimeoutId = setTimeout(async () => {
        if (!this.callAccepted && !this.callRejected && !this.callEnded && this.currentRoomId) {
          console.log("⏰ Call timeout - no answer after 30 seconds");
          
          const { db, doc, updateDoc } = FB();
          try {
            await updateDoc(doc(db, 'calls', this.currentRoomId), {
              status: 'timeout',
              endedAt: new Date()
            });
          } catch(e) {}
          
          this.endCall();
          this.showToast(`${calleeName} didn't answer`, "error");
        }
      }, 30000);
      
    } catch (error) {
      console.error("❌ Error starting call:", error);
      this.showToast("Failed to start call: " + error.message, "error");
      this.endCall();
    }
  }

  listenForCallResponse(roomId) {
    const { db, doc, onSnapshot } = FB();
    const callRef = doc(db, 'calls', roomId);
    
    if (this.callStatusListener) {
      this.callStatusListener();
    }
    
    this.callStatusListener = onSnapshot(callRef, (snap) => {
      const data = snap.data();
      if (data) {
        console.log("📞 Call status update:", data.status);
        
        if (data.status === 'timeout' && !this.callEnded) {
          console.log("⏰ Call timed out");
          this.stopRingtone();
          this.removeIncomingCallModal();
          
          if (!this.callAccepted && !this.callRejected) {
            if (this.isInitiator) {
              this.showToast(`${this.currentCalleeName} didn't answer`, "error");
            } else {
              this.showToast(`Missed call from ${data.callerName}`, "error");
            }
          }
          
          this.endCall();
          return;
        }
        
        if (data.status === 'accepted' && !this.callAccepted && !this.callEnded) {
          console.log("✅ Call accepted!");
          this.callAccepted = true;
          this.isCallActive = true;
          this.stopRingtone();
          this.startCallTimer();
          
          if (this.callTimeoutId) {
            clearTimeout(this.callTimeoutId);
            this.callTimeoutId = null;
          }
          
          if (this.callWindow && !this.callWindow.closed) {
            this.callWindow.postMessage({ type: 'CALL_ACCEPTED' }, '*');
          }
        } 
        else if (data.status === 'rejected' && !this.callRejected && !this.callEnded) {
          console.log("❌ Call rejected");
          this.callRejected = true;
          this.stopRingtone();
          this.removeIncomingCallModal();
          
          if (this.callTimeoutId) {
            clearTimeout(this.callTimeoutId);
            this.callTimeoutId = null;
          }
          
          if (this.callWindow && !this.callWindow.closed) {
            this.callWindow.close();
          }
          
          if (this.isInitiator) {
            this.showToast(`${this.currentCalleeName} rejected the call`, "error");
          }
          
          this.endCall();
        } 
        else if (data.status === 'ended' && !this.callEnded) {
          console.log("📞 Call ended by other party");
          this.stopRingtone();
          this.removeIncomingCallModal();
          this.isCallActive = false;
          
          if (this.callTimeoutId) {
            clearTimeout(this.callTimeoutId);
            this.callTimeoutId = null;
          }
          
          if (this.callWindow && !this.callWindow.closed) {
            this.callWindow.close();
          }
          
          this.cleanupCall();
          if (!this.callEnded) {
            this.showToast("Call ended by the other party", "info");
          }
          this.callEnded = true;
        }
      }
    }, (error) => {
      console.error("Error listening for call response:", error);
    });
  }

  acceptCall(roomId, callerId, callType, callerName) {
    console.log("✅ Accepting call from:", callerName);
    
    this.stopRingtone();
    this.removeIncomingCallModal();
    
    this.currentCallType = callType;
    this.currentCalleeName = callerName;
    this.currentCalleeId = callerId;
    this.currentRoomId = roomId;
    this.isInitiator = false;
    this.callAccepted = true;
    this.callEnded = false;
    this.isCallActive = true;
    
    const { db, doc, updateDoc } = FB();
    updateDoc(doc(db, 'calls', roomId), {
      status: 'accepted'
    }).catch(e => console.error("Error updating call status:", e));
    
    this.startCallTimer();
    this.openCallPopup(roomId, callType, callerName, false, callerId);
  }

  rejectCall(roomId) {
    console.log("❌ Rejecting call");
    
    this.stopRingtone();
    this.removeIncomingCallModal();
    
    const { db, doc, updateDoc } = FB();
    updateDoc(doc(db, 'calls', roomId), {
      status: 'rejected',
      rejectedAt: new Date()
    }).catch(e => console.error("Error rejecting call:", e));
    
    this.showToast("Call rejected", "info");
  }

  playRingtone() {
    this.stopRingtone();

    if (window.BooliSound && window.BooliSound.playCallRingtone) {
      window.BooliSound.playCallRingtone();
      return;
    }

    try {
      this.ringtoneAudio = new Audio('sounds/call.mp3');
      this.ringtoneAudio.loop = true;
      this.ringtoneAudio.volume = 0.5;
      this.ringtoneAudio.play().catch(e => {
        console.warn("Ringtone play failed:", e);
        this.ringtoneAudio = new Audio('sounds/notification.wav');
        this.ringtoneAudio.loop = true;
        this.ringtoneAudio.volume = 0.5;
        this.ringtoneAudio.play().catch(e2 => console.warn("Fallback ringtone failed:", e2));
      });
    } catch(e) {
      console.log("Ringtone error:", e);
    }
  }

  stopRingtone() {
    if (window.BooliSound && window.BooliSound.stopCallRingtone) {
      window.BooliSound.stopCallRingtone();
    }

    if (this.ringtoneAudio) {
      this.ringtoneAudio.pause();
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio = null;
    }
  }

  removeIncomingCallModal() {
    if (this.incomingCallModal && this.incomingCallModal.remove) {
      this.incomingCallModal.remove();
    }
    this.incomingCallModal = null;
  }

  async cleanupCall() {
    console.log("🧹 Cleaning up call resources...");
    
    this.stopCallTimer();
    
    if (this.callTimeoutId) {
      clearTimeout(this.callTimeoutId);
      this.callTimeoutId = null;
    }
    
    if (this.popupCheckInterval) {
      clearInterval(this.popupCheckInterval);
      this.popupCheckInterval = null;
    }
    
    this.stopRingtone();
    this.removeIncomingCallModal();
    
    if (this.localTracks) {
      this.localTracks.forEach(track => {
        if (track && track.close) {
          track.close();
        }
      });
      this.localTracks = null;
    }
    
    if (this.screenTrack) {
      const screenTrack = Array.isArray(this.screenTrack) ? this.screenTrack[0] : this.screenTrack;
      if (screenTrack && screenTrack.close) screenTrack.close();
      this.screenTrack = null;
    }
    
    if (this.client) {
      try {
        await this.client.leave();
        console.log("✅ Left Agora channel");
      } catch(e) {
        console.error("Error leaving channel:", e);
      }
      this.client = null;
    }
    
    if (this.callStatusListener) {
      this.callStatusListener();
      this.callStatusListener = null;
    }
    
    this.isCallActive = false;
    this.callAccepted = false;
    this.callRejected = false;
    this.isScreenSharing = false;
    this.currentRoomId = null;
    this.currentCallType = null;
    this.currentCalleeName = null;
    this.currentCalleeId = null;
    this.callWindow = null;
    this.callStartTime = null;
    this.callDuration = 0;
    this.callEnded = true;
  }

  async endCall() {
    if (this.callEnded && !this.currentRoomId) {
      console.log("Call already ended, skipping");
      return;
    }

    console.log("📞 Ending call...");
    
    if (this.callTimeoutId) {
      clearTimeout(this.callTimeoutId);
      this.callTimeoutId = null;
    }
    
    this.stopRingtone();
    this.removeIncomingCallModal();
    this.stopCallTimer();

    if (this.currentRoomId && state.user) {
      try {
        const { db, collection, addDoc, doc, updateDoc } = FB();
        
        try {
          await updateDoc(doc(db, 'calls', this.currentRoomId), {
            status: 'ended',
            endedAt: new Date(),
            duration: this.callDuration
          });
          console.log("✅ Call status updated to ended in Firestore");
        } catch(e) {
          console.log("Call document may not exist or already ended");
        }
        
        const callHistoryRef = collection(db, 'users', state.user.uid, 'callHistory');
        await addDoc(callHistoryRef, {
          id: this.currentRoomId,
          calleeId: this.currentCalleeId,
          calleeName: this.currentCalleeName,
          callType: this.currentCallType,
          isInitiator: this.isInitiator,
          startTime: this.callStartTime,
          duration: this.callDuration,
          status: this.callAccepted ? 'ended' : (this.callRejected ? 'rejected' : 'missed'),
          endedAt: Date.now(),
          timestamp: Date.now()
        });
        console.log("✅ Call history saved");

      } catch(e) {
        console.error("Error saving call history:", e);
      }
    }

    if (this.callWindow && !this.callWindow.closed) {
      try {
        this.callWindow.close();
      } catch(e) {}
    }

    await this.cleanupCall();
    console.log("✅ Call ended successfully");
  }

  startCallTimer() {
    this.callStartTime = Date.now();
    this.callTimer = setInterval(() => {
      if (this.isCallActive && !this.callEnded) {
        this.callDuration = Math.floor((Date.now() - this.callStartTime) / 1000);
      }
    }, 1000);
  }

  stopCallTimer() {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
  }

  listenForIncomingCalls() {
    if (!state.user) return;
    console.log("👂 Listening for incoming calls for user:", state.user.uid);
    
    const { db, collection, query, where, onSnapshot } = FB();
    const callsRef = collection(db, 'calls');
    const q = query(callsRef, where('calleeId', '==', state.user.uid), where('status', '==', 'ringing'));
    
    if (this.incomingCallListener) {
      this.incomingCallListener();
    }
    
    this.incomingCallListener = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const callData = change.doc.data();
          console.log("📞 Incoming call detected from:", callData.callerName);
          
          // Don't show modal if already in a call or if call is from blocked user
          if (!this.isCallActive && !this.callEnded && !this.incomingCallModal && !this.callAccepted && this.currentRoomId !== callData.roomId) {
            this.showIncomingCall(
              callData.callerId,
              callData.callerName,
              callData.callType,
              callData.roomId
            );
          }
        } else if (change.type === 'modified') {
          const callData = change.doc.data();
          if (callData.status !== 'ringing') {
            console.log("Call status changed to:", callData.status, "- closing modal");
            this.stopRingtone();
            this.removeIncomingCallModal();
          }
        } else if (change.type === 'removed') {
          console.log("Call document removed - closing modal");
          this.stopRingtone();
          this.removeIncomingCallModal();
        }
      });
    }, (error) => {
      console.error("Error listening for calls:", error);
    });
  }

  showIncomingCall(callerId, callerName, callType, roomId) {
    this.removeIncomingCallModal();
    
    const modal = document.createElement('div');
    modal.className = 'incoming-call-modal';
    modal.id = `incoming-call-${roomId}`;
    modal.innerHTML = `
      <div class="incoming-call-card">
        <div class="incoming-call-avatar">
          ${this.escapeHtml(callerName.charAt(0).toUpperCase())}
        </div>
        <h3>${this.escapeHtml(callerName)}</h3>
        <p><i class="fas fa-${callType === 'video' ? 'video' : 'phone'}"></i> ${callType === 'video' ? 'Video Call' : 'Audio Call'}</p>
        <div class="incoming-call-buttons">
          <button class="incoming-call-btn accept" onclick="window.callManager.acceptCall('${roomId}', '${callerId}', '${callType}', '${this.escapeHtml(callerName)}')">
            <i class="fas fa-phone"></i> Accept
          </button>
          <button class="incoming-call-btn reject" onclick="window.callManager.rejectCall('${roomId}')">
            <i class="fas fa-times"></i> Reject
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.incomingCallModal = modal;
    this.playRingtone();
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
}

const callManager = new CallManager();

window.startCall = async (type) => {
  if (!state.currentContact) {
    if (window.toast) window.toast("Select a contact first", "error");
    return;
  }
  console.log("📞 Starting", type, "call to:", state.currentContact.name);
  await callManager.startCall(
    state.currentContact.id,
    state.currentContact.name,
    type
  );
};

window.endCall = () => {
  callManager.endCall();
};

window.addEventListener('message', (event) => {
  if (event.data.type === 'CALL_ACCEPTED') {
    console.log("Call accepted notification received");
    callManager.callAccepted = true;
    callManager.isCallActive = true;
    callManager.startCallTimer();
  } else if (event.data.type === 'CALL_ENDED') {
    console.log("Call ended notification from window");
    callManager.endCall();
  }
});

window.addEventListener('load', () => {
  console.log("🚀 Main page loaded");
  setTimeout(() => {
    if (window._firebase && window._firebase.auth) {
      window._firebase.onAuthStateChanged(window._firebase.auth, (user) => {
        if (user) {
          console.log("👤 User logged in:", user.uid);
          setTimeout(() => {
            callManager.listenForIncomingCalls();
          }, 2000);
        }
      });
    }
  }, 1000);
});

window.callManager = callManager;