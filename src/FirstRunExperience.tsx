import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, ChevronLeft, ChevronRight, Compass, ListTodo, Timer, X } from 'lucide-react';
import { translations, type Language } from './i18n';

interface FirstRunExperienceProps {
  language: Language;
  theme: 'light' | 'dark';
  open: boolean;
  islamicToolsEnabled: boolean;
  onComplete: (islamicToolsEnabled: boolean, startTour: boolean) => void;
  onTourChange: (active: boolean) => void;
}

const tourTargets = [
  { id: 'navigation', icon: Compass, titleKey: 'tourNavigationTitle', bodyKey: 'tourNavigationBody' },
  { id: 'timer', icon: Timer, titleKey: 'tourTimerTitle', bodyKey: 'tourTimerBody' },
  { id: 'tasks', icon: ListTodo, titleKey: 'tourTasksTitle', bodyKey: 'tourTasksBody' },
  { id: 'settings', icon: Check, titleKey: 'tourSettingsTitle', bodyKey: 'tourSettingsBody' },
] as const;

function focusFirstControl(dialog: HTMLDivElement | null) {
  dialog?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus();
}

function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.key === 'Escape') {
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
  ));
  if (controls.length === 0) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export default function FirstRunExperience({
  language,
  theme,
  open,
  islamicToolsEnabled,
  onComplete,
  onTourChange,
}: FirstRunExperienceProps) {
  const t = translations[language];
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [includeIslamicTools, setIncludeIslamicTools] = useState(islamicToolsEnabled);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const completeWelcome = (startTour: boolean) => {
    onComplete(includeIslamicTools, startTour);
    if (startTour) setTourStep(0);
  };

  useEffect(() => {
    if (!open && tourStep === null) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusFirstControl(dialogRef.current);
    return () => previousFocus?.focus();
  }, [open, tourStep]);

  useEffect(() => {
    if (tourStep === null) {
      setTargetRect(null);
      onTourChange(false);
      return;
    }
    onTourChange(true);
    const selector = `[data-tour="${tourTargets[tourStep].id}"]`;
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) {
      setTourStep((current) => current === null || current >= tourTargets.length - 1 ? null : current + 1);
      return;
    }
    target.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    const measure = () => setTargetRect(target.getBoundingClientRect());
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [tourStep, onTourChange]);

  const finishTour = () => {
    setTourStep(null);
    onTourChange(false);
  };

  if (open) {
    return createPortal(
      <div className={`first-run-backdrop ${theme}`}>
        <div
          ref={dialogRef}
          className="first-run-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="first-run-title"
          aria-describedby="first-run-description"
          onKeyDown={(event) => trapDialogFocus(event, () => completeWelcome(false))}
        >
          <div className="first-run-mark" aria-hidden="true"><Timer size={22} /></div>
          <p className="first-run-kicker">{t.firstRunWelcome}</p>
          <h1 id="first-run-title">{t.firstRunTitle}</h1>
          <p id="first-run-description" className="first-run-description">{t.firstRunDescription}</p>
          <label className="first-run-choice">
            <input
              type="checkbox"
              checked={includeIslamicTools}
              onChange={(event) => setIncludeIslamicTools(event.target.checked)}
            />
            <span className="first-run-choice-icon"><BookOpen size={19} aria-hidden="true" /></span>
            <span>
              <strong>{t.firstRunIslamicTools}</strong>
              <small>{t.firstRunIslamicToolsHint}</small>
            </span>
          </label>
          <div className="first-run-actions">
            <button type="button" className="first-run-primary" onClick={() => completeWelcome(true)}>
              <Compass size={17} aria-hidden="true" />
              {t.firstRunStartTour}
            </button>
            <button type="button" className="first-run-secondary" onClick={() => completeWelcome(false)}>
              {t.firstRunSkip}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  if (tourStep === null) return null;

  const activeStep = tourTargets[tourStep];
  const StepIcon = activeStep.icon;
  const viewportWidth = window.innerWidth;
  const cardWidth = Math.min(360, viewportWidth - 32);
  const targetTop = targetRect?.top ?? window.innerHeight / 2;
  const targetLeft = targetRect?.left ?? (viewportWidth - cardWidth) / 2;
  const targetBottom = targetRect?.bottom ?? targetTop;
  const hasRoomBelow = targetBottom + 245 < window.innerHeight;
  const cardTop = hasRoomBelow ? targetBottom + 18 : Math.max(16, targetTop - 230);
  const cardLeft = Math.min(Math.max(16, targetLeft), viewportWidth - cardWidth - 16);
  const cutout = targetRect ? {
    top: Math.max(0, targetRect.top - 8),
    left: Math.max(0, targetRect.left - 8),
    right: Math.min(viewportWidth, targetRect.right + 8),
    bottom: Math.min(window.innerHeight, targetRect.bottom + 8),
  } : null;

  return createPortal(
    <div className={`product-tour ${theme}`}>
      {cutout ? (
        <div className="tour-shades" aria-hidden="true">
          <div className="tour-shade" style={{ top: 0, left: 0, right: 0, height: cutout.top }} />
          <div className="tour-shade" style={{ top: cutout.top, left: 0, width: cutout.left, height: cutout.bottom - cutout.top }} />
          <div className="tour-shade" style={{ top: cutout.top, left: cutout.right, right: 0, height: cutout.bottom - cutout.top }} />
          <div className="tour-shade" style={{ top: cutout.bottom, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-target-outline" style={{ top: cutout.top, left: cutout.left, width: cutout.right - cutout.left, height: cutout.bottom - cutout.top }} />
        </div>
      ) : <div className="tour-fallback-shade" aria-hidden="true" />}
      <div
        ref={dialogRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-description"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
        onKeyDown={(event) => trapDialogFocus(event, finishTour)}
      >
        <div className="tour-card-topline">
          <span><StepIcon size={17} aria-hidden="true" /> {t.tourLabel}</span>
          <button type="button" className="tour-close" onClick={finishTour} aria-label={t.firstRunSkip}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <h2 id="tour-title">{t[activeStep.titleKey]}</h2>
        <p id="tour-description">{t[activeStep.bodyKey]}</p>
        <div className="tour-card-footer">
          <span>{t.tourStep.replace('{current}', String(tourStep + 1)).replace('{total}', String(tourTargets.length))}</span>
          <div className="tour-controls">
            <button
              type="button"
              className="tour-previous"
              onClick={() => setTourStep((step) => Math.max(0, (step ?? 0) - 1))}
              disabled={tourStep === 0}
              aria-label={t.tourPrevious}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tour-next"
              onClick={() => tourStep === tourTargets.length - 1 ? finishTour() : setTourStep(tourStep + 1)}
            >
              {tourStep === tourTargets.length - 1 ? t.tourFinish : t.tourNext}
              {tourStep !== tourTargets.length - 1 && <ChevronRight size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
