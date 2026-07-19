import { supabase } from '@/integrations/supabase/client';

type EdgeResponseLike = {
  clone?: () => EdgeResponseLike;
  status?: number;
  text?: () => Promise<string>;
};

const isResponseLike = (value: unknown): value is EdgeResponseLike => {
  return typeof value === 'object' && value !== null && 'status' in value && 'text' in value;
};

const parseResponseBody = async <T>(response: EdgeResponseLike): Promise<T | null> => {
  const source = typeof response.clone === 'function' ? response.clone() : response;
  const text = typeof source.text === 'function' ? await source.text() : '';

  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

export async function invokeFunctionWithResponseFallback<TResponse>(
  functionName: string,
  body: Record<string, unknown>
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (!error) {
    const typedData = data as TResponse & { error?: string; success?: boolean };

    if (typedData?.error) {
      throw new Error(typedData.error);
    }

    if (typedData?.success === false) {
      throw new Error(typedData.error || 'Request failed');
    }

    return typedData;
  }

  const errorObj = error as any;
  let parsedErrorMsg = error.message;
  
  if (errorObj.context && typeof errorObj.context.json === 'function') {
    try {
      const errBody = await errorObj.context.json();
      if (errBody && errBody.error) parsedErrorMsg = errBody.error;
    } catch (e) {
      // ignore
    }
  } else if (errorObj.context && typeof errorObj.context.text === 'function') {
    try {
      const textBody = await errorObj.context.text();
      const errBody = JSON.parse(textBody);
      if (errBody && errBody.error) parsedErrorMsg = errBody.error;
    } catch (e) {
      // ignore
    }
  }

  throw new Error(parsedErrorMsg || 'Request failed');
}