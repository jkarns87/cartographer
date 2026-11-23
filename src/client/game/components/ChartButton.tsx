type Props = {
  visible: boolean;
  onChart: () => void;
  busy: boolean;
};

/**
 * "Chart it" appears once every clue is lit. On portrait it is fixed to the
 * bottom edge and slides up; at `lg:` it sits in the sidebar flow. The slide
 * is a transform transition that `motion-reduce:` disables.
 */
export const ChartButton = ({ visible, onChart, busy }: Props) => (
  <div
    className={[
      'fixed inset-x-0 bottom-0 z-30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
      'bg-linear-to-t from-paper via-paper/95 to-transparent',
      'transition-transform duration-300 ease-out motion-reduce:transition-none',
      'lg:static lg:bg-none lg:p-0 lg:transition-none',
      visible ? 'translate-y-0' : 'pointer-events-none translate-y-full lg:hidden',
    ].join(' ')}
    aria-hidden={!visible}
  >
    <button
      type="button"
      onClick={onChart}
      disabled={!visible || busy}
      tabIndex={visible ? 0 : -1}
      className={[
        'mx-auto flex h-12 w-full max-w-md items-center justify-center rounded-xl',
        'bg-lit px-6 text-base font-semibold text-white shadow-lg',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit',
        'disabled:opacity-70',
      ].join(' ')}
    >
      {busy ? 'Charting…' : 'Chart it'}
    </button>
  </div>
);
