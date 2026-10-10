/** Big, friendly microphone button with a pulsing ring while listening. */
export default function MicButton({ listening, onClick, size = 'lg', label, disabled }) {
  const dims = size === 'xl' ? 'h-28 w-28 text-5xl' : size === 'lg' ? 'h-20 w-20 text-4xl' : 'h-14 w-14 text-2xl';
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? 'सुन रहा हूँ — रोकने के लिए दबाएँ / Listening — tap to stop' : 'बोलने के लिए दबाएँ / Tap to speak'}
        className={`relative grid ${dims} place-items-center rounded-full text-white shadow-lg transition focus:outline-none focus-visible:ring-4 focus-visible:ring-saffron-400/60 disabled:opacity-50 ${listening ? 'bg-red-500' : 'bg-gradient-to-br from-saffron-500 to-saffron-600 hover:scale-105'}`}
      >
        {listening && <span className="absolute inset-0 animate-pulsering rounded-full bg-red-400" aria-hidden />}
        {!listening && <span className="decor absolute inset-0 animate-pulsering rounded-full bg-saffron-400 opacity-40 [animation-duration:2.4s]" aria-hidden />}
        <span className="relative" aria-hidden>{listening ? '⏹️' : '🎤'}</span>
      </button>
      {label !== false && (
        <span className="text-center text-sm font-semibold text-stone-600 dark:text-stone-300">
          {label || (listening ? 'सुन रहा हूँ… · Listening…' : 'दबाकर बोलिए · Tap & speak')}
        </span>
      )}
    </div>
  );
}
