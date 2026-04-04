// all_sound.js - Booli App Sound Manager - FULLY FIXED

// ===== সাউন্ড ফাইল পাথ কনফিগারেশন =====
const SOUND_CONFIG = {
    call: 'sounds/call.mp3',
    notification: 'sounds/notification.wav',
    send: 'sounds/send.wav',
    addContact: 'sounds/notification.wav',
    logout: 'sounds/send.wav',
    login: 'sounds/send.wav',
    message: 'sounds/notification.wav',
    error: 'sounds/noti_2.wav',
    success: 'sounds/send.wav',
    typing: 'sounds/send.wav',
    callEnd: 'sounds/send.wav',
    callConnect: 'sounds/send.wav'
};

// ===== অডিও ক্যাশে =====
const audioCache = {};

// ===== সাউন্ড স্টেট =====
const soundState = {
    enabled: true,
    callRingtoneEnabled: true,
    notificationEnabled: true,
    messageSoundEnabled: true,
    volume: 0.7
};

// ===== লোকাল স্টোরেজ থেকে সেটিংস লোড =====
function loadSoundSettings() {
    const savedSettings = localStorage.getItem('booli-sound-settings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            Object.assign(soundState, settings);
        } catch (e) {
            console.error('সাউন্ড সেটিংস লোড করতে সমস্যা:', e);
        }
    }
}

// ===== সেটিংস সেভ =====
function saveSoundSettings() {
    localStorage.setItem('booli-sound-settings', JSON.stringify(soundState));
}

// ===== অডিও প্রিলোড =====
function preloadAudio(soundName) {
    if (!audioCache[soundName] && SOUND_CONFIG[soundName]) {
        try {
            audioCache[soundName] = new Audio(SOUND_CONFIG[soundName]);
            audioCache[soundName].preload = 'auto';
            audioCache[soundName].volume = soundState.volume;
        } catch (e) {
            console.error(`অডিও প্রিলোড করতে সমস্যা (${soundName}):`, e);
        }
    }
}

// ===== সব অডিও প্রিলোড =====
function preloadAllSounds() {
    Object.keys(SOUND_CONFIG).forEach(soundName => {
        preloadAudio(soundName);
    });
}

// ===== সাউন্ড প্লে ফাংশন - FIXED =====
function playSound(soundName, options = {}) {
    if (!soundState.enabled) {
        console.log('সাউন্ড ডিসএবল আছে');
        return null;
    }

    if (soundName === 'call' && !soundState.callRingtoneEnabled) {
        return null;
    }
    if ((soundName === 'notification' || soundName === 'message') && !soundState.notificationEnabled) {
        return null;
    }
    if (soundName === 'send' && !soundState.messageSoundEnabled) {
        return null;
    }

    const soundPath = SOUND_CONFIG[soundName];
    if (!soundPath) {
        console.warn(`সাউন্ড পাওয়া যায়নি: ${soundName}`);
        return null;
    }

    try {
        let audio = audioCache[soundName];
        if (!audio) {
            audio = new Audio(soundPath);
            audio.preload = 'auto';
            audioCache[soundName] = audio;
        }

        audio.volume = options.volume !== undefined ? options.volume : soundState.volume;
        audio.loop = options.loop || false;
        audio.currentTime = 0;
        
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.warn(`সাউন্ড প্লে করতে সমস্যা (${soundName}):`, err.message);
                if (err.name === 'NotAllowedError') {
                    console.log('অটোপ্লে ব্লক করা হয়েছে। ব্যবহারকারীর ইন্টারঅ্যাকশন প্রয়োজন।');
                }
            });
        }
        
        return audio;
    } catch (e) {
        console.error(`সাউন্ড প্লে করতে সমস্যা (${soundName}):`, e);
        return null;
    }
}

// ===== সাউন্ড স্টপ ফাংশন =====
function stopSound(soundName) {
    const audio = audioCache[soundName];
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = false;
    }
}

// ===== সব সাউন্ড স্টপ =====
function stopAllSounds() {
    Object.values(audioCache).forEach(audio => {
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.loop = false;
        }
    });
}

// ===== সুনির্দিষ্ট সাউন্ড ফাংশন =====

function playCallRingtone() {
    return playSound('call', { loop: true });
}

function stopCallRingtone() {
    stopSound('call');
}

function playNotificationSound() {
    return playSound('notification');
}

function playSendSound() {
    return playSound('send');
}

function playMessageSound() {
    return playSound('message');
}

function playAddContactSound() {
    return playSound('addContact');
}

function playLogoutSound() {
    return playSound('logout');
}

function playLoginSound() {
    return playSound('login');
}

function playErrorSound() {
    return playSound('error');
}

function playSuccessSound() {
    return playSound('success');
}

function playTypingSound() {
    return playSound('typing');
}

function playCallEndSound() {
    return playSound('callEnd');
}

function playCallConnectSound() {
    return playSound('callConnect');
}

// ===== সেটিংস কন্ট্রোল ফাংশন =====

function setSoundEnabled(enabled) {
    soundState.enabled = enabled;
    saveSoundSettings();
    if (!enabled) {
        stopAllSounds();
    }
}

function setCallRingtoneEnabled(enabled) {
    soundState.callRingtoneEnabled = enabled;
    saveSoundSettings();
    if (!enabled) {
        stopCallRingtone();
    }
}

function setNotificationEnabled(enabled) {
    soundState.notificationEnabled = enabled;
    saveSoundSettings();
}

function setMessageSoundEnabled(enabled) {
    soundState.messageSoundEnabled = enabled;
    saveSoundSettings();
}

function setVolume(volume) {
    soundState.volume = Math.max(0, Math.min(1, volume));
    saveSoundSettings();
    
    Object.values(audioCache).forEach(audio => {
        if (audio) {
            audio.volume = soundState.volume;
        }
    });
}

function getSoundSettings() {
    return { ...soundState };
}

// ===== ইনিশিয়ালাইজ =====
function initSoundManager() {
    loadSoundSettings();
    preloadAllSounds();
    console.log('🔊 সাউন্ড ম্যানেজার ইনিশিয়ালাইজড');
    
    // User interaction এর পর সাউন্ড সক্রিয় করার জন্য
    const enableAudioOnInteraction = () => {
        document.removeEventListener('click', enableAudioOnInteraction);
        document.removeEventListener('touchstart', enableAudioOnInteraction);
        document.removeEventListener('keydown', enableAudioOnInteraction);
        
        // Create silent audio context to enable audio
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().then(() => {
                console.log('🔊 Audio context activated');
                silentAudio.pause();
            }).catch(e => console.log('Audio activation:', e.message));
        } catch(e) {}
    };
    
    document.addEventListener('click', enableAudioOnInteraction);
    document.addEventListener('touchstart', enableAudioOnInteraction);
    document.addEventListener('keydown', enableAudioOnInteraction);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSoundManager);
} else {
    initSoundManager();
}

// ===== এক্সপোর্ট =====
window.BooliSound = {
    play: playSound,
    stop: stopSound,
    stopAll: stopAllSounds,
    
    playCallRingtone,
    stopCallRingtone,
    playNotificationSound,
    playSendSound,
    playMessageSound,
    playAddContactSound,
    playLogoutSound,
    playLoginSound,
    playErrorSound,
    playSuccessSound,
    playTypingSound,
    playCallEndSound,
    playCallConnectSound,
    
    setEnabled: setSoundEnabled,
    setCallRingtone: setCallRingtoneEnabled,
    setNotification: setNotificationEnabled,
    setMessageSound: setMessageSoundEnabled,
    setVolume,
    getSettings: getSoundSettings,
    
    state: soundState,
    config: SOUND_CONFIG
};

console.log('📢 all_sound.js লোডড - ফিক্সড ভার্সন');