import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, } from "./supabaseConfig.js";
let client = null;
export function getSupabaseClient() {
    if (client) {
        return client;
    }
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("Supabase 설정값이 비어 있습니다. src/web/supabaseConfig.ts를 확인하세요.");
    }
    if (!window.supabase) {
        throw new Error("Supabase JS SDK를 불러오지 못했습니다. 네트워크 연결을 확인하세요.");
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
        },
    });
    return client;
}
export async function ensureAnonymousSession() {
    const supabase = getSupabaseClient();
    const sessionResult = await supabase.auth.getSession();
    assertNoSupabaseError(sessionResult.error);
    if (sessionResult.data.session) {
        return;
    }
    const signInResult = await supabase.auth.signInAnonymously();
    assertNoSupabaseError(signInResult.error);
}
export async function getMyAccount() {
    const result = await getSupabaseClient().rpc("get_my_account");
    assertNoSupabaseError(result.error);
    return firstRow(result.data);
}
export async function createAccount(nickname) {
    const result = await getSupabaseClient().rpc("create_account", {
        nickname,
    });
    assertNoSupabaseError(result.error);
    const account = firstRow(result.data);
    if (!account) {
        throw new Error("계정을 만들지 못했습니다.");
    }
    return account;
}
export async function redeemLinkCode(nickname, code) {
    const result = await getSupabaseClient().rpc("redeem_link_code", {
        nickname,
        code,
    });
    assertNoSupabaseError(result.error);
    return firstRow(result.data);
}
export async function createLinkCode() {
    const result = await getSupabaseClient().rpc("create_link_code");
    assertNoSupabaseError(result.error);
    const linkCode = firstRow(result.data);
    if (!linkCode) {
        throw new Error("연결 코드를 만들지 못했습니다.");
    }
    return linkCode;
}
export async function getProgress() {
    const result = await getSupabaseClient().rpc("get_progress");
    assertNoSupabaseError(result.error);
    return result.data;
}
export async function saveProgress(progressJson) {
    const result = await getSupabaseClient().rpc("save_progress", {
        progress_json: progressJson,
    });
    assertNoSupabaseError(result.error);
}
export async function recordStageSolve(input) {
    const result = await getSupabaseClient().rpc("record_stage_solve", {
        p_puzzle_id: input.puzzleId,
        p_puzzle_size: input.size,
        p_game_difficulty: input.difficulty,
        p_puzzle_stage: input.stage,
        p_elapsed_seconds: input.elapsedSeconds,
    });
    assertNoSupabaseError(result.error);
    const ranking = firstRow(result.data);
    if (!ranking) {
        throw new Error("풀이 순위를 저장하지 못했습니다.");
    }
    return ranking;
}
function firstRow(data) {
    return Array.isArray(data) && data.length > 0 ? data[0] ?? null : null;
}
function assertNoSupabaseError(error) {
    if (error) {
        throw new Error(error.message);
    }
}
