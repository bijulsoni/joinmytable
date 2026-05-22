'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  submitCompanionVerification,
  type CompanionVerificationInput,
} from '@/lib/auth/verification';
import { uploadVerificationDocument, uploadVerificationSelfie } from '@/lib/auth/storage';

const Schema = z.object({
  legalName: z.string().min(1, 'Enter the name on your ID.').max(200, 'Legal name is too long.'),
});

export type CompanionVerifyState = { status: 'idle' } | { status: 'error'; message: string };

export async function submitCompanionVerificationAction(
  _prev: CompanionVerifyState,
  formData: FormData,
): Promise<CompanionVerifyState> {
  const parsed = Schema.safeParse({
    legalName: String(formData.get('legalName') ?? '').trim(),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid submission.',
    };
  }

  const document = formData.get('document');
  if (!(document instanceof Blob) || document.size === 0) {
    return { status: 'error', message: 'Upload a photo of your ID.' };
  }
  const selfie = formData.get('selfie');
  if (!(selfie instanceof Blob) || selfie.size === 0) {
    return { status: 'error', message: 'Take or upload a selfie too.' };
  }

  const uploadedDoc = await uploadVerificationDocument(document);
  if (!uploadedDoc.ok) {
    return { status: 'error', message: uploadedDoc.error };
  }
  const uploadedSelfie = await uploadVerificationSelfie(selfie);
  if (!uploadedSelfie.ok) {
    return { status: 'error', message: uploadedSelfie.error };
  }

  const payload: CompanionVerificationInput = {
    legalName: parsed.data.legalName,
    documentPath: uploadedDoc.path,
    selfiePath: uploadedSelfie.path,
  };

  const result = await submitCompanionVerification(payload);
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }

  redirect('/verify');
}
