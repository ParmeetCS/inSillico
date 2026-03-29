import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_REFRESH_TIMEOUT_MS = 1500;

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

export async function middleware(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Fail open when auth env vars are not configured to avoid edge errors.
    if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.next({ request });
    }

    let supabaseResponse = NextResponse.next({ request });
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
        () => timeoutController.abort(),
        AUTH_REFRESH_TIMEOUT_MS
    );

    if (!request.signal.aborted) {
        request.signal.addEventListener(
            "abort",
            () => timeoutController.abort(),
            { once: true }
        );
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
            global: {
                fetch: (input, init) => {
                    const signal = init?.signal ?? timeoutController.signal;
                    return fetch(input, {
                        ...init,
                        signal,
                    });
                },
            },
        }
    );

    try {
        await supabase.auth.getUser();
    } catch (error) {
        // Avoid blocking requests if auth refresh times out.
        if (isAbortError(error)) {
            return supabaseResponse;
        }
        // Re-throw unexpected errors
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/simulations/:path*",
        "/molecules/new/:path*",
        "/copilot/:path*",
    ],
};
