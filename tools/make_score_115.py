"""Original royalty-free orchestral/marching score for WW2 Royale, composed for this project.
No samples, third-party recordings, or existing copyrighted melodies are used.
Re-run to rebuild client/assets/audio/music-loop.wav.
"""
import math, wave
from pathlib import Path
import numpy as np
from scipy.signal import lfilter

root=Path(__file__).resolve().parent.parent
out=root/'client/assets/audio/music-loop.wav'
rate=22050
bpm=100
beat=60/bpm
bars=16
duration=bars*4*beat
rng=np.random.default_rng(1939)
N=round(duration*rate)
mix=np.zeros(N,dtype=np.float64)

def add(signal,start,vol=1.0):
    i=int(round(start*rate))
    if i>=N:return
    n=min(len(signal),N-i)
    if n>0:mix[i:i+n]+=signal[:n]*vol

def note(midi):return 440*(2**((midi-69)/12))

def voice(midi,length,kind='brass',attack=.035,release=.13):
    n=max(1,int(length*rate))
    t=np.arange(n)/rate
    f=note(midi)
    # vibrato restrained; harmonics for brass and strings without using samples
    vib=np.sin(2*np.pi*5.1*t)*(0.0019 if kind=='brass' else 0.0035)
    phase=2*np.pi*f*(t+vib/(2*np.pi*f))
    if kind=='brass':
        x=np.sin(phase)+.33*np.sin(2*phase)+.15*np.sin(3*phase)+.08*np.sin(4*phase)
    elif kind=='strings':
        x=np.sin(phase)+.21*np.sin(2*phase)+.10*np.sin(3*phase)+.06*np.sin(5*phase)
    elif kind=='bass':
        x=np.sin(phase)+.20*np.sin(2*phase)+.08*np.sin(3*phase)
    else:x=np.sin(phase)
    env=np.minimum(1,t/max(0.001,attack))
    env*=np.minimum(1,(length-t)/max(0.001,release))
    # Brass swells, staccato bass has fast transient
    return (x*env).astype('float64')

def impact(start,kind='snare',vol=1.0):
    dur=.25 if kind=='snare' else .44
    n=int(dur*rate)
    t=np.arange(n)/rate
    if kind=='snare':
        white=rng.standard_normal(n)
        # brighter brushed military snare and quick decay
        x=lfilter([1,-.68],[1],white)
        x/=max(1e-9,np.max(np.abs(x)))
        x*=np.exp(-26*t)
        x+=.12*np.sin(2*np.pi*170*t)*np.exp(-38*t)
    else:
        x=np.sin(2*np.pi*(85*t-22*t*t))*np.exp(-10*t)
        x+=.07*rng.standard_normal(n)*np.exp(-18*t)
    add(x,start,vol)

# Each bar's chord; 16 bars = 38.4 seconds. Written for this game, not based on a historical tune.
chords=[(45,52,57),(45,52,57),(41,48,53),(41,48,53),
        (38,45,50),(38,45,50),(40,47,52),(40,47,52),
        (45,52,57),(43,50,55),(41,48,53),(40,47,52),
        (38,45,50),(41,48,53),(40,47,52),(45,52,57)]
# Original horns: quarter and half notes, with rests for breathing room.
melody=[
 (69,1),(72,1),(76,1),(74,1), (72,2),(69,1),(67,1),
 (65,1),(69,1),(72,1),(74,1), (72,2),(69,2),
 (67,1),(69,1),(70,1),(74,1), (72,1),(70,1),(69,2),
 (71,1),(74,1),(76,1),(71,1), (74,2),(71,2),
 (69,1),(72,1),(76,1),(79,1), (77,2),(74,1),(72,1),
 (69,1),(72,1),(74,1),(76,1), (74,1),(72,1),(71,1),(69,1),
 (70,1),(74,1),(77,1),(76,1), (74,2),(72,1),(69,1),
 (71,1),(76,1),(74,1),(71,1), (69,2),(69,2),
]
assert sum(d for _,d in melody)==64
at=0
for midi,d in melody:
    length=d*beat*.92
    add(voice(midi,length,'brass',.035,.14),at*beat,.095)
    add(voice(midi-12,length,'strings',.17,.20),at*beat,.022)
    at+=d
for b,chord in enumerate(chords):
    start=b*4*beat
    # soft legato strings, each note spans the bar, then marching low strings
    for note_midi in chord:
        add(voice(note_midi+12,4*beat+.12,'strings',.28,.42),start,.022)
    root=chord[0]
    for j in range(4):
        add(voice(root,beat*.58,'bass',.014,.12),start+j*beat,.092)
        if j in (0,2):add(voice(root-12,beat*.45,'bass',.008,.1),start+j*beat,.055)
    # Soft timpani on downbeat, snare on beats two and four
    impact(start,'kick',.115)
    impact(start+beat,'snare',.12)
    impact(start+3*beat,'snare',.13)
    # marching hi-hat / faint snare subdivisions
    for k in range(8):
        impact(start+k*.5*beat,'snare',.018)
# Faint harmonised brass tail on final 4 bars for a crescendo
for b in range(12,16):
    start=b*4*beat
    root=chords[b][0]
    for n in [root+24,root+31]:
        add(voice(n,4*beat*.90,'brass',.20,.45),start,.022+(b-12)*.006)

# Mild room echo, no harsh clipping
mix+=np.pad(mix[:-int(rate*.13)]*.095,(int(rate*.13),0))[:N]
mix+=np.pad(mix[:-int(rate*.27)]*.05,(int(rate*.27),0))[:N]
# Audible but not overwhelming under UI effects
peak=max(1e-9,np.max(np.abs(mix)))
mix=(mix/peak)*.78
# 60 ms fade at edges for seamless repeat and avoid click
fade=int(rate*.06)
mix[:fade]*=np.linspace(0,1,fade)
mix[-fade:]*=np.linspace(1,0,fade)
pcm=(np.clip(mix,-1,1)*32767).astype('<i2')
with wave.open(str(out),'wb') as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(pcm.tobytes())
print('Wrote',out,'duration',round(duration,2),'seconds, MB',round(out.stat().st_size/1048576,2))
