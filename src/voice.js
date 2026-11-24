// Voice, using what Windows already has (nothing downloaded, nothing sent anywhere by this app).
//  - Talk to type: opens Windows voice typing (the Win+H panel) on the focused message box.
//  - Read aloud: Windows' built-in speech voices (System.Speech), offline.
const { spawn } = require('child_process');

const ps = (script, input) => {
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  p.on('error', () => {});
  if (input != null) p.stdin.end(input, 'utf8'); else p.stdin.end();
  return p;
};

// Presses Win+H, the same as doing it by hand. Windows then types what you say into the focused box.
function startVoiceTyping() {
  ps("Add-Type -Namespace TM -Name K -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);';"
    + ' [TM.K]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [TM.K]::keybd_event(0x48,0,0,[UIntPtr]::Zero);'
    + ' [TM.K]::keybd_event(0x48,0,2,[UIntPtr]::Zero); [TM.K]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)');
}

let speaker = null;
function plain(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/^#+\s*/gm, '').replace(/[*_>|]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 6000);
}
function speak(text, voice) {
  stopSpeaking();
  const t = plain(text); if (!t) return;
  const pick = voice ? `try { $s.SelectVoice('${String(voice).replace(/'/g, '')}') } catch {};` : '';
  speaker = ps(`Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${pick} $s.Rate = 1; $s.Speak([Console]::In.ReadToEnd())`, t);
  const me = speaker; speaker.on('exit', () => { if (speaker === me) speaker = null; });
}
function stopSpeaking() { if (speaker) { try { speaker.kill(); } catch { /* gone */ } speaker = null; } }
const isSpeaking = () => !!speaker;

module.exports = { startVoiceTyping, speak, stopSpeaking, isSpeaking, plain };
