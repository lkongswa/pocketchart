// ReviewPromptCard — Dashboard card that prompts users for a review at milestone moments.
// Routes happy users (4-5 stars) to Capterra, unhappy users (1-3 stars) to private feedback.
// Designed to feel native to the dashboard — not pushy, not a popup.

import React, { useState } from 'react';
import { Star, X, ExternalLink, MessageSquare } from 'lucide-react';

// ── Placeholder URLs — replace with real ones after creating profiles ──
const CAPTERRA_REVIEW_URL = 'https://reviews.capterra.com/new/VENDOR_ID';
const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/FORM_ID/viewform';

type Phase = 'stars' | 'positive_ask' | 'negative_ask';

interface ReviewPromptCardProps {
  milestone: string;
  onComplete: () => void;
}

const MILESTONE_LABELS: Record<string, string> = {
  '50_notes_signed': "You've signed 50 notes — nice work!",
  '30_days_active': "You've been using PocketChart for a month!",
  'first_invoice': 'You generated your first invoice!',
  '100_appointments': "You've created 100 appointments!",
};

export default function ReviewPromptCard({ milestone, onComplete }: ReviewPromptCardProps) {
  const [phase, setPhase] = useState<Phase>('stars');
  const [rating, setRating] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [transitioning, setTransitioning] = useState(false);

  const handleStarClick = (star: number) => {
    setRating(star);
    setTransitioning(true);
    setTimeout(() => {
      setPhase(star >= 4 ? 'positive_ask' : 'negative_ask');
      setTransitioning(false);
    }, 300);
  };

  const handleAction = async (action: string) => {
    try {
      await window.api.reviewPrompts.record({ rating, action });
    } catch (err) {
      console.error('[ReviewPromptCard] Failed to record:', err);
    }

    if (action === 'review_site') {
      window.api.shell.openExternal(CAPTERRA_REVIEW_URL);
    } else if (action === 'feedback') {
      window.api.shell.openExternal(FEEDBACK_FORM_URL);
    }

    onComplete();
  };

  const handleDismiss = async () => {
    // From stars phase → permanent dismiss; from positive_ask → remind later
    const action = phase === 'positive_ask' ? 'remind_later' : 'dismissed';
    try {
      await window.api.reviewPrompts.record({ rating: rating || null, action });
    } catch (err) {
      console.error('[ReviewPromptCard] Failed to record dismiss:', err);
    }
    onComplete();
  };

  return (
    <div
      className={`mb-6 relative rounded-lg border border-gray-200 border-l-4 border-l-teal-400 bg-white p-5 transition-opacity duration-300 ${
        transitioning ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Dismiss X */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
        title="Dismiss"
      >
        <X size={16} />
      </button>

      {/* ── Stars Phase ── */}
      {phase === 'stars' && (
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)] pr-6">
            How's PocketChart working for you?
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Your feedback helps us improve — and helps other therapists find tools that work.
          </p>
          <div className="flex items-center gap-1 mt-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => handleStarClick(star)}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  size={28}
                  className={`transition-colors duration-150 ${
                    (hoveredStar || rating) >= star
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Positive Ask Phase (4-5 stars) ── */}
      {phase === 'positive_ask' && (
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)] pr-6">
            That's great to hear! 🎉
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Your review helps other therapists find better tools. It only takes 2 minutes.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => handleAction('review_site')}
              className="btn-primary text-sm"
            >
              <ExternalLink size={14} className="mr-1.5" />
              Leave a Review on Capterra
            </button>
            <button
              onClick={() => handleAction('remind_later')}
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}

      {/* ── Negative Ask Phase (1-3 stars) ── */}
      {phase === 'negative_ask' && (
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)] pr-6">
            Thanks for being honest.
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            We'd love to know what's not working so we can fix it. Your feedback goes directly to the developer.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => handleAction('feedback')}
              className="btn-secondary text-sm"
            >
              <MessageSquare size={14} className="mr-1.5" />
              Share Feedback
            </button>
            <button
              onClick={() => handleAction('dismissed')}
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              No Thanks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
