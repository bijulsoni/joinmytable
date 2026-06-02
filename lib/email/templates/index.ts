// Transactional email templates — barrel export.
//
// Each template is a typed function: `(data) => { subject, html, text }`.
// Pass the template (not its result) to `sendEmail` along with the data
// object; `sendEmail` will invoke the template internally so callers
// keep full type-safety on the data shape.

export { requestReceivedTemplate, type RequestReceivedData } from './request-received';
export { requestAcceptedTemplate, type RequestAcceptedData } from './request-accepted';
export { requestDeclinedTemplate, type RequestDeclinedData } from './request-declined';
export { bookingConfirmedTemplate, type BookingConfirmedData } from './booking-confirmed';
export { mealReminderTemplate, type MealReminderData } from './meal-reminder';
export { paymentConfirmedTemplate, type PaymentConfirmedData } from './payment-confirmed';
export { bookingCompletedTemplate, type BookingCompletedData } from './booking-completed';
export { reviewPromptTemplate, type ReviewPromptData } from './review-prompt';
export {
  verificationApprovedTemplate,
  type VerificationApprovedData,
} from './verification-approved';

export type { EmailContent, EmailTemplate } from './_shared';
