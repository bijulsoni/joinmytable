'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  submitCompanionVerification,
  type CompanionVerificationInput,
} from '@/lib/auth/verification';
import { uploadVerificationDocument, uploadVerificationSelfie } from '@/lib/auth/storage';

const Schema = z.object({
  // Optional now — only needed for the full ID tier. Selfie alone gets
  // you discoverable (basic).
  legalName: z.string().max(200, 'Legal name is too long.').optional(),
});

export type CompanionVerifyState = { status: 'idle' } | { status: 'error'; message: string };

export async function submitCompanionVerificationAction(
  _prev: CompanionVerifyState,
  formData: FormData,
): Promise<CompanionVerifyState> {
  const parsed = Schema.safeParse({
    legalName: String(formData.get('legalName') ?? '').trim() || undefined,
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid submission.',
    };
  }

  // Selfie is the only required upload — it's what gets a companion into
  // Explore (basic tier). The government ID is optional here; it can be
  // added now (faster full verification) or later, when accepting a
  // request prompts for it.
  const selfie = formData.get('selfie');
  if (!(selfie instanceof Blob) || selfie.size === 0) {
    return { status: 'error', message: 'A selfie is required to get into Explore.' };
  }
  const uploadedSelfie = await uploadVerificationSelfie(selfie);
  if (!uploadedSelfie.ok) {
    return { status: 'error', message: uploadedSelfie.error };
  }

  let documentPath: string | null = null;
  const document = formData.get('document');
  if (document instanceof Blob && document.size > 0) {
    const uploadedDoc = await uploadVerificationDocument(document);
    if (!uploadedDoc.ok) {
      return { status: 'error', message: uploadedDoc.error };
    }
    documentPath = uploadedDoc.path;
  }

  const payload: CompanionVerificationInput = {
    legalName: parsed.data.legalName ?? '',
    documentPath,
    selfiePath: uploadedSelfie.path,
  };

  const result = await submitCompanionVerification(payload);
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }

  redirect('/verify');
}
