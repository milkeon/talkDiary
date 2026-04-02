let db, ai, model;

const state = {
    apiKey: '',
    userName: '',
    preferredTone: 'banmal',
    selectedDate: new Date().toISOString().split('T')[0],
    isProcessing: false,
    chatHistory: [],
    authMode: 'selection',
    selectedUserForLogin: null,
    isDiarySaving: false,
    saveTimer: null,
    inactivityTimer: null // [NEW] 20초 무입력 감지 타이머
};

// 시스템 프롬프트: 어제의 기억과 세련된 문체를 위한 지침
function getSystemPrompt(userName, tone, recentSummary = "") {
    const toneStyle = tone === 'banmal'
        ? `친구처럼 다정하고 편안한 반말로 대화하세요. ${userName}님을 소중히 대하세요.`
        : `정중하고 예의 바른 존댓말로 따뜻하게 대화하세요. ${userName}님을 존중하세요.`;

    let summaryContext = "";
    if (recentSummary) {
        summaryContext = `
[기억해야 할 전날의 조각]
"${recentSummary}"
대화 초반이나 흐름 중간에 위 내용을 언급하며 안부를 물어봐주세요. (예: "어제는 ~ 때문에 바쁘셨는데 오늘은 좀 여유로운가요?")
`;
    }

    return `
당신은 'FrienDiary'의 세심한 기록가이자 친구입니다. 사용자(${userName})의 오늘을 깊이 있게 듣고 기록하세요.
${summaryContext}

대화 가이드라인:
1. **${toneStyle}**
2. **필수 확인**: 오늘의 날씨(풍경), 오늘 먹은 특별한 식사, 오늘 하루를 지배한 감정의 결(기분).
3. **자연스러운 전개**: 질문을 한꺼번에 던지지 마세요. 답변에 정성스럽게 리액션한 후, **문장의 맨 마지막은 반드시 질문(?)으로 끝맺으세요.** 질문 뒤에 다른 사족을 절대 붙이지 마세요.
4. **마침표**: 대화가 어느 정도 진행되었거나 사용자가 종료 의사를 보이면 따뜻한 인사와 함께 답변 끝에 반드시 "[DIARY_READY]"를 붙이세요. **이때는 절대로 질문(? 문항)을 던지지 말고 담백하게 마무리하세요.**
5. **관계의 심화**: 사용자(${userName})의 이름을 다정하게 부르며, 대화가 이어질수록 더 깊은 유대감을 형성하세요.

6. **사실 기반**: 사용자가 말하지 않은 사실을 절대 지어내지 마세요.
`;
}

async function loadEnv() {
    try {
        const response = await fetch('env.txt?t=' + Date.now());
        const text = await response.text();
        const env = {};
        text.split(/\r?\n/).forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                let val = (match[2] || '').split('#')[0].replace(/(^['"]|['"]$)/g, '').trim();
                env[match[1]] = val;
            }
        });
        return env;
    } catch (e) { return {}; }
}

$(document).ready(async function () {
    const env = await loadEnv();
    state.apiKey = env.GEMINI_API_KEY;
    if (state.apiKey) initAI();
    initFirebase(env);

    // [이벤트 리스너 등록]
    $('#send-btn').on('click', handleUserInput);
    $('#user-input').on('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserInput(); } });
    $('.nav-links li').on('click', function () { switchView($(this).data('view')); });

    $(document).on('click', '.logo', function () {
        if (state.userName) {
            if (confirm('홈 화면으로 이동하시겠습니까? (로그아웃됩니다)')) logout(true);
        } else {
            toggleAuthView('selection');
        }
    });

    $('#logout-btn').on('click', logout);
    $('#show-signup-btn').on('click', () => toggleAuthView('signup'));
    $('#cancel-signup-btn').on('click', () => toggleAuthView('selection'));
    $('#back-to-users').on('click', () => toggleAuthView('selection'));
    $('#login-btn').on('click', login);
    $('#signup-btn').on('click', signup);

    // [엔터 키 로그인/가입 지원]
    $('#login-password').on('keydown', (e) => { if (e.key === 'Enter') login(); });
    $('#signup-name, #signup-password').on('keydown', (e) => { if (e.key === 'Enter') signup(); });

    $('.close-modal').on('click', () => $('#diary-modal').hide());
    $(window).on('click', (e) => { if ($(e.target).is('#diary-modal')) $('#diary-modal').hide(); });

    $('#date-selector').on('change', function () {
        state.selectedDate = $(this).val();
        $('#chat-messages').empty();
        state.chatHistory = [];
        startChat();
    });

    initUI();
    initStars(); // [RESTORED] 배경 별빛 초기화
    initStardust(); // 고성능 캔버스 엔진 초기화
    initStarTrail(); // 마우스 트레일 초기화
    initStarClick(); // 마우스 클릭 효과 초기화
});

function initFirebase(env) {
    const config = {
        apiKey: env.FIREBASE_API_KEY,
        authDomain: env.FIREBASE_AUTH_DOMAIN,
        projectId: env.FIREBASE_PROJECT_ID,
        storageBucket: env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
        appId: env.FIREBASE_APP_ID
    };
    try {
        db = window.firebaseFirestore.getFirestore(window.firebaseCore.initializeApp(config));
        loadUsers();
    } catch (e) { console.error(e); }
}

async function loadUsers() {
    if (!db) return;
    const { collection, getDocs, query, orderBy } = window.firebaseFirestore;
    try {
        const q = query(collection(db, "users"), orderBy("userName", "asc"));
        const snap = await getDocs(q);
        const users = snap.docs.map(doc => doc.data());
        renderUserCards(users);
    } catch (e) { console.error("Error loading users:", e); }
}

function renderUserCards(users) {
    const $container = $('#user-cards');
    $container.empty();
    const hamsterImg = "assets/hamster_profile.png?v=1015";

    if (users.length === 0) {
        $container.html('<p style="grid-column: 1/-1; color:var(--text-secondary); font-size:0.9rem;">등록된 이야기가 없습니다.<br>새 이야기를 시작해 보세요!</p>');
        return;
    }
    users.forEach(user => {
        const $card = $(`
            <div class="user-card" data-name="${user.userName}">
                <div class="avatar"><img src="${hamsterImg}" alt="avatar"></div>
                <div class="name">${user.userName}</div>
            </div>
        `);
        $card.on('click', () => showLogin(user));
        $container.append($card);
    });
}

function toggleAuthView(mode) {
    state.authMode = mode;
    // [FIX] 모든 인증 관련 인풋 초기화
    $('#login-password, #signup-name, #signup-password').val('');

    $('#user-selection-view, #login-view, #signup-view').hide();
    if (mode === 'selection') $('#user-selection-view').show();
    else if (mode === 'login') {
        $('#login-view').show();
        $('#login-password').focus();
    }
    else if (mode === 'signup') {
        $('#signup-view').show();
        $('#signup-name').focus();
    }
}

function showLogin(user) {
    state.selectedUserForLogin = user;
    $('#login-title').text(`${user.userName}님으로 로그인`);
    $('#login-password').val('');
    toggleAuthView('login');
}

async function login() {
    const password = $('#login-password').val();
    if (!password) { alert('비밀번호를 입력해주세요.'); return; }

    if (state.selectedUserForLogin.password === password) {
        completeLogin(state.selectedUserForLogin.userName, state.selectedUserForLogin.preferredTone || 'banmal');
    } else {
        alert('비밀번호가 일치하지 않습니다.');
    }
}

async function signup() {
    const name = $('#signup-name').val().trim();
    const password = $('#signup-password').val().trim();
    if (!name || !password) { alert('닉네임과 비밀번호를 모두 입력해주세요.'); return; }

    const { collection, doc, setDoc, getDoc } = window.firebaseFirestore;
    try {
        const userRef = doc(db, "users", name);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            alert('이미 존재하는 닉네임입니다.');
            return;
        }

        await setDoc(userRef, {
            userName: name,
            password: password,
            preferredTone: 'banmal',
            createdAt: new Date()
        });

        completeLogin(name, 'banmal');
    } catch (e) { console.error(e); alert('회원가입 중 오류가 발생했습니다.'); }
}

function completeLogin(name, tone) {
    state.userName = name;
    state.preferredTone = tone;
    $('#user-display-name').text(name);
    $('#auth-overlay').fadeOut(400);
    $('.app-container').fadeIn(400);

    // [FIX] 로그인 시 별빛 효과 기본 OFF (대화 집중)
    isEffectEnabled = false;
    $('#effect-toggle').removeClass('active');

    startChat();
}

function logout(skipConfirm = false) {
    if (!skipConfirm && !confirm('로그아웃 하시겠습니까?')) return;
    state.userName = '';
    state.chatHistory = [];
    $('#chat-messages').empty();
    $('.app-container').hide();
    $('#auth-overlay').show();

    // [FIX] 로그아웃 시 별빛 효과 기본 ON (랜딩 페이지 화려함 유지)
    isEffectEnabled = true;
    $('#effect-toggle').addClass('active');

    toggleAuthView('selection');
    loadUsers();
}

function initAI() {
    try {
        ai = new window.GoogleGenerativeAI(state.apiKey);
        model = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        if (state.userName) startChat();
    } catch (e) { console.error(e); }
}

async function startChat() {
    if (!state.userName || !ai) return;
    if (state.chatHistory.length > 0) return;

    const recentSummary = await getRecentSummary();
    const isBanmal = state.preferredTone === 'banmal';

    const greeting = isBanmal
        ? `안녕, ${state.userName}! 기다리고 있었어. 😊 오늘 날씨는 어땠어?`
        : `안녕하세요, ${state.userName}님. 기다리고 있었습니다. 😊 오늘 날씨는 어떠셨나요? 맑고 화창했나요?`;

    state.chatHistory = [
        { role: "user", parts: [{ text: getSystemPrompt(state.userName, state.preferredTone, recentSummary) }] },
        { role: "model", parts: [{ text: greeting }] }
    ];
    addMessage("bot", greeting);
    resetInactivityTimer(); // [NEW] 첫 대화 시작 시 타이머 작동
}

async function getRecentSummary() {
    if (!db || !state.userName) return "";
    const { collection, query, where, getDocs } = window.firebaseFirestore;
    try {
        const q = query(
            collection(db, "summaries"),
            where("userName", "==", state.userName)
        );
        const qs = await getDocs(q);
        if (qs.empty) return "";
        const summaries = qs.docs.map(d => d.data());
        summaries.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
        return summaries[0].content;
    } catch (e) { return ""; }
}

async function handleUserInput() {
    const input = $('#user-input').val().trim();
    if (!input || state.isProcessing) return;
    $('#user-input').val('');
    addMessage("user", input);

    if (!model || !state.userName) return;

    if (state.chatHistory.length === 0) {
        const recentSummary = await getRecentSummary();
        state.chatHistory = [
            { role: "user", parts: [{ text: getSystemPrompt(state.userName, state.preferredTone, recentSummary) }] },
            { role: "model", parts: [{ text: "대화를 시작할 준비가 됐어!" }] }
        ];
    }

    state.isProcessing = true;
    showTyping();

    const stopWords = ["그만", "끝", "다음에", "나중에", "졸려", "자야지", "피곤해", "잘 가", "바이", "수고했어"];
    const shouldStop = stopWords.some(w => input.includes(w));
    let finalInput = input;
    if (shouldStop) finalInput += " (사용자가 대화를 마칠 준비가 되었습니다. 더 이상 질문하지 말고 다정하게 작별 인사를 건넨 뒤 [DIARY_READY]를 붙여주세요.)";

    try {
        const chat = model.startChat({ history: state.chatHistory });
        const result = await chat.sendMessage(finalInput);
        const botText = (await result.response).text();
        hideTyping();

        state.chatHistory.push({ role: "user", parts: [{ text: input }] });
        state.chatHistory.push({ role: "model", parts: [{ text: botText }] });

        if (botText.includes("[DIARY_READY]")) {
            addMessage("bot", botText.replace("[DIARY_READY]", "").trim());
            setTimeout(() => generateAIDiary(), 1000);
        } else { addMessage("bot", botText); }

    } catch (e) {
        hideTyping();
        console.error(e);
        addMessage("bot", "잠시 오류가 생겼어. 다시 말해줘!");
    } finally { 
        state.isProcessing = false; 
        resetInactivityTimer(); // [NEW] 응답 완료 후 다시 20초 대기
    }
}

async function generateAIDiary() {
    addMessage("bot", `${state.userName}님의 소중한 오늘을 차분하게 갈무리해 볼게요... ✨`);
    showTyping();
    try {
        const diaryModel = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        const prompt = `당신은 오늘 하루를 보낸 사용자 본인입니다. 대화 속에 등장하는 AI가 작성을 대신해주는 것이 아니라, **당신이 대화 상대(AI)와 이야기를 나눈 뒤 직접 쓰는 개인적인 일기**를 작성하세요.
        
작성 원칙 (MUST):
1. **정직성**: 대화에서 언급되지 않은 사실이나 감정을 절대 지어내지 마세요. "안녕"만 했다면 일기도 짧게 인사만 하세요.
2. **분량 비례**: 일기 길이는 실제 대화의 양에 엄격히 비례해야 합니다. 짧은 대화에 긴 고찰을 적지 마세요.
3. **호칭**: 오직 '나'를 주어로 사용하며, 대화 내용에만 충실하게 성숙한 스타일로 작성하세요.`;

        const result = await diaryModel.generateContent(prompt + "\n\n[대화 내용]\n" + JSON.stringify(state.chatHistory));
        const finalDiary = result.response.text();
        hideTyping();
        await addMessage("bot", `### ✨ 오늘의 일기 기록<br>\n\n${finalDiary.replace(/\n/g, '<br>')}`);

        // [FIX] 대기 없이 즉시 자동 저장 호출
        await saveToFirebase(finalDiary, state.chatHistory);
    } catch (e) {
        hideTyping();
        console.error("Diary error:", e);
        addMessage("bot", "일기 작성 중 오류가 생겼습니다.");
    }
}

async function saveToFirebase(content, history) {
    if (!db || !state.userName || state.isDiarySaving) return;
    state.isDiarySaving = true;

    const { doc, setDoc, Timestamp, collection, query, where, getDocs, deleteDoc } = window.firebaseFirestore;

    // [FIX] 고유 문서 ID 생성 (사용자_날짜)
    const docId = `${state.userName}_${state.selectedDate}`;
    const diaryDate = new Date(state.selectedDate);

    try {
        // [CLEANUP] 해당 날짜의 기존 모든 일기 삭제 (중복 소탕)
        const q = query(
            collection(db, "diaries"),
            where("userName", "==", state.userName),
            where("date", "==", Timestamp.fromDate(diaryDate))
        );
        const querySnapshot = await getDocs(q);
        const deletePromises = querySnapshot.docs.map(d => deleteDoc(doc(db, "diaries", d.id)));
        await Promise.all(deletePromises);

        // [SAVE] 최종본 저장
        const logs = history.filter((h, i) => i > 0).map(h => ({
            role: h.role === 'user' ? '사용자' : 'AI',
            message: h.parts[0].text.replace("[DIARY_READY]", "").trim()
        }));

        const diaryData = {
            userName: state.userName,
            date: Timestamp.fromDate(diaryDate),
            content: content,
            chatLogs: logs,
            timestamp: Date.now()
        };

        await setDoc(doc(db, "diaries", docId), diaryData);

        addMessage("bot", "✅ 오늘 하루도 고생 많았어. 기록이 안전하게 저장되었어! 👍");
        await checkAndGenerate3DaySummary();
    } catch (e) {
        console.error("Save failed:", e);
        addMessage("bot", "❌ 기록 저장 중 오류 발생.");
    } finally {
        state.isDiarySaving = false;
        state.saveTimer = null;
    }
}

async function checkAndGenerate3DaySummary() {
    if (!ai || !db || !state.userName) return;
    const { collection, getDocs, query, where, addDoc } = window.firebaseFirestore;
    try {
        const q = query(collection(db, "diaries"), where("userName", "==", state.userName));
        const dSnap = await getDocs(q);
        if (dSnap.empty) return;
        let myDiaries = dSnap.docs.map(doc => doc.data());
        myDiaries.sort((a, b) => b.date.seconds - a.date.seconds);
        myDiaries = myDiaries.slice(0, 3);
        if (myDiaries.length < 3) return;

        const last3Days = [...myDiaries].reverse();
        const startTimestamp = last3Days[0].date;
        const endTimestamp = last3Days[2].date;

        const checkQ = query(collection(db, "summaries"), where("userName", "==", state.userName), where("startDate", "==", startTimestamp), where("endDate", "==", endTimestamp));
        const existingSummary = await getDocs(checkQ);
        if (!existingSummary.empty) return;

        const diaryText = last3Days.map((d) => `[${d.date.toDate().toLocaleDateString('ko-KR')}]\n${d.content}`).join("\n\n");
        const summaryModel = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        const result = await summaryModel.generateContent("3일 요약 생성 프롬프트..." + "\n\n" + diaryText);
        const summary = result.response.text();

        await addDoc(collection(db, "summaries"), {
            userName: state.userName,
            startDate: startTimestamp,
            endDate: endTimestamp,
            content: summary,
            createdAt: new Date()
        });
        loadSummaries();
    } catch (e) { console.error("Summary engine error:", e); }
}

async function addMessage(sender, text) {
    if (sender === 'user') resetInactivityTimer(); // [NEW] 사용자 입력 시 타이머 리셋
    const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    const $msg = $(`<div class="message ${sender}"></div>`);
    $('#chat-messages').append($msg);
    if (sender === 'bot') {
        const tempDiv = document.createElement('div'); tempDiv.innerHTML = formattedText;
        for (const node of Array.from(tempDiv.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                for (const char of node.textContent.split('')) {
                    $msg.append(document.createTextNode(char));
                    $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight);
                    await new Promise(r => setTimeout(r, 20));
                }
            } else { $msg.append(node.cloneNode(true)); $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight); }
        }
    } else { $msg.html(formattedText); }
    $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight); $('#user-input').focus();
}

function showTyping() {
    $('#chat-messages').append('<div class="message bot typing" id="typing-indicator"><div class="dots"><span></span><span></span><span></span></div></div>');
    requestAnimationFrame(() => { $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight); });
}

function hideTyping() { $('#typing-indicator').remove(); }

function initUI() {
    const now = new Date();
    const krDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    state.selectedDate = krDate;
    $('#date-selector').val(state.selectedDate);
    $('#user-input').focus();
}

function switchView(id) {
    $('.view-section').removeClass('active'); $(`#${id}`).addClass('active');
    $('.nav-links li').removeClass('active'); $(`.nav-links li[data-view="${id}"]`).addClass('active');
    if (id === 'history-view') loadHistory();
    if (id === 'summary-view') loadSummaries();
}

async function loadHistory() {
    if (!db || !state.userName) return;
    const { collection, getDocs, query, where } = window.firebaseFirestore;
    try {
        const q = query(collection(db, "diaries"), where("userName", "==", state.userName));
        const qs = await getDocs(q);
        if (qs.empty) { $('#history-list').html('<p class="no-data">아직 기록이 없습니다.</p>'); return; }
        const myDiaries = qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        myDiaries.sort((a, b) => b.date.seconds - a.date.seconds);
        const list = $('#history-list');
        list.empty();
        myDiaries.forEach(data => {
            const dateStr = data.date.toDate().toLocaleDateString('ko-KR');
            const card = $(`<div class="history-card"><div class="date">${dateStr}</div><div class="preview">${data.content}</div></div>`);
            card.on('click', () => openDiaryModal(data));
            list.append(card);
        });
    } catch (e) { console.error(e); }
}

function openDiaryModal(diary) {
    $('#modal-date').text(diary.date.toDate().toLocaleDateString('ko-KR'));
    $('#modal-diary-content').html(diary.content.replace(/\n/g, '<br>'));
    $('#diary-modal').fadeIn(300);
}

async function loadSummaries() {
    if (!db || !state.userName) return;
    const { collection, getDocs, query, where } = window.firebaseFirestore;
    try {
        const q = query(collection(db, "summaries"), where("userName", "==", state.userName));
        const qs = await getDocs(q);
        if (qs.empty) { $('#weekly-overview').html('<p class="no-data">요약이 없습니다.</p>'); return; }
        const mySummaries = qs.docs.map(doc => doc.data());
        mySummaries.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
        let html = '';
        mySummaries.forEach(d => {
            const s = d.startDate.toDate().toLocaleDateString('ko-KR');
            const e = d.endDate.toDate().toLocaleDateString('ko-KR');
            html += `<div class="summary-card"><h3>📅 ${s} ~ ${e}</h3><p>${d.content.replace(/\n/g, '<br>')}</p></div>`;
        });
        $('#weekly-overview').html(html);
        generateWeeklyStats();
    } catch (e) { console.error(e); }
}

async function generateWeeklyStats() {
    if (!ai || !db || !state.userName) return;
    const { collection, getDocs, query, where } = window.firebaseFirestore;
    try {
        const q = query(collection(db, "diaries"), where("userName", "==", state.userName));
        const dSnap = await getDocs(q);
        if (dSnap.empty) return;
        let myDiaries = dSnap.docs.map(doc => doc.data());
        myDiaries.sort((a, b) => b.date.seconds - a.date.seconds);
        myDiaries = myDiaries.slice(0, 7);
        const allContent = myDiaries.map(d => d.content).join("\n");
        const statsModel = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        const result = await statsModel.generateContent("주간 통계 추출 프롬프트..." + "\n" + allContent);
        const stats = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());
        $('#mood-stats').html(`<div class="stat-item"><span class="mood-badge">${stats.mood}</span><span>${stats.score}점</span></div>`);
        $('#keyword-stats').html(stats.keywords.map(k => `<span class="keyword-chip"># ${k}</span>`).join(""));
    } catch (e) { console.error(e); }
}

// [RESTORED] 배경 별빛 생성 함수
function initStars() {
    const container = document.querySelector('.star-container');
    if (!container) return;
    const starCount = 200;
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        const size = Math.random() * 2 + 1;
        star.style.width = star.style.height = `${size}px`;
        star.style.left = `${Math.random() * 100}vw`;
        star.style.top = `${Math.random() * 100}vh`;
        star.style.setProperty('--duration', `${Math.random() * 3 + 2}s`);
        star.style.setProperty('--opacity', Math.random() * 0.7 + 0.3);
        star.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(star);
    }
}

// --- 🌌 고성능 은하수 캔버스 엔진 ---
let pileCanvas, pileCtx, flyingCanvas, flyingCtx, floorMap = [], activeParticles = [];
const maxPileHeight = 9999, maxActiveParticles = 500;
let lastClickTime = 0, mx = 0, my = 0, dripFrameCounter = 0, meteorTimer = 0, isEffectEnabled = true;

function initStardust() {
    pileCanvas = document.getElementById('stardust-pile-canvas');
    flyingCanvas = document.getElementById('stardust-flying-canvas');
    if (!pileCanvas || !flyingCanvas) return;
    pileCtx = pileCanvas.getContext('2d');
    flyingCtx = flyingCanvas.getContext('2d');
    const resize = () => {
        pileCanvas.width = flyingCanvas.width = window.innerWidth;
        pileCanvas.height = flyingCanvas.height = window.innerHeight;
        floorMap = new Array(Math.ceil(window.innerWidth)).fill(0);
    };
    window.addEventListener('resize', resize); resize();
    $(document).on('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
    $(document).on('click', '#effect-toggle', function (e) {
        e.stopPropagation(); // [FIX] 부모 로고 클릭 이벤트 전파 차단 (홈 이동 방지)
        isEffectEnabled = !isEffectEnabled;
        $(this).toggleClass('active', isEffectEnabled);
        if (!isEffectEnabled) activeParticles = activeParticles.filter(p => p.type === 'meteor');
    });
    $(document).on('dblclick', '.logo', () => clearStardust());
    requestAnimationFrame(updateStardust);
}

function updateStardust(timestamp) {
    if (!flyingCtx) return;
    flyingCtx.clearRect(0, 0, flyingCanvas.width, flyingCanvas.height);
    if (!meteorTimer) meteorTimer = timestamp;
    if (timestamp - meteorTimer > 10000) { spawnShootingStar(); meteorTimer = timestamp; }
    if (isEffectEnabled) {
        dripFrameCounter++;
        if (dripFrameCounter % 8 === 0) createParticle(mx, my, (Math.random() - 0.5) * 1.5, Math.random() * 2 + 0.5, '#fff', Math.random() * 10 + 10);
    }
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        p.vx *= p.friction; p.vy *= p.friction; p.vy += p.gravity; p.x += p.vx; p.y += p.vy;
        if (p.type === 'meteor') {
            if (p.y > flyingCanvas.height + 100 || p.x > flyingCanvas.width + 100 || p.x < -100) { activeParticles.splice(i, 1); continue; }
            drawMeteor(p, timestamp); // [REFINED] timestamp 전달
            continue;
        }
        const ix = Math.floor(p.x);
        const currentFloor = flyingCanvas.height - (floorMap[ix] || 0);
        if (p.y >= currentFloor || p.x < 0 || p.x > flyingCanvas.width) {
            if (p.y >= currentFloor) bakeStarToPile(p);
            activeParticles.splice(i, 1); continue;
        }
        flyingCtx.save();
        flyingCtx.fillStyle = p.color; flyingCtx.shadowColor = '#fff'; flyingCtx.shadowBlur = 12;
        flyingCtx.font = `${p.size}px serif`; flyingCtx.textAlign = 'center'; flyingCtx.textBaseline = 'middle';
        flyingCtx.fillText('✦', p.x, p.y); flyingCtx.restore();
    }
    requestAnimationFrame(updateStardust);
}

function spawnShootingStar() {
    // [REFINED] 항상 오른쪽 상단 외곽에서 생성
    const x = flyingCanvas.width + 100;
    const y = Math.random() * (flyingCanvas.height * 0.3); // 화면 위쪽 30% 영역
    const vx = -(10 + Math.random() * 8); // 왼쪽으로 빠르게 이동
    const vy = 3 + Math.random() * 4;

    activeParticles.push({
        x, y, vx, vy,
        type: 'meteor', color: '#fff', size: 2.5, friction: 1.0, gravity: 0, trail: []
    });
}

function drawMeteor(p, timestamp) {
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 50) p.trail.shift(); // [REFINED] 꼬리 길이 2.5배 강화

    flyingCtx.save();

    // 꼬리 그리기 (점진적으로 투명해지는 효과)
    flyingCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    flyingCtx.lineWidth = 1.5;
    flyingCtx.beginPath();
    if (p.trail.length > 0) {
        flyingCtx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let t of p.trail) flyingCtx.lineTo(t.x, t.y);
    }
    flyingCtx.stroke();

    // [REFINED] 머리 부분 반짝임(Twinkle) 연산
    const twinkle = Math.sin(timestamp / 50) * 10 + 20;

    flyingCtx.fillStyle = '#fff';
    flyingCtx.shadowColor = '#fff';
    flyingCtx.shadowBlur = twinkle; // 광채가 계속 변함
    flyingCtx.beginPath();
    flyingCtx.arc(p.x, p.y, 2.5 + Math.sin(timestamp / 100), 0, Math.PI * 2);
    flyingCtx.fill();

    // 코어 부분은 더 밝게
    flyingCtx.shadowBlur = 5;
    flyingCtx.fillStyle = '#fff';
    flyingCtx.beginPath();
    flyingCtx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    flyingCtx.fill();

    flyingCtx.restore();
}

function bakeStarToPile(p) {
    if (!pileCtx) return;
    const ix = Math.floor(p.x); if (ix < 0 || ix >= floorMap.length) return;
    const radius = 4;
    for (let i = -radius; i <= radius; i++) {
        const tx = ix + i;
        if (tx >= 0 && tx < floorMap.length) {
            const amount = (radius - Math.abs(i)) * 0.25;
            if (floorMap[tx] < maxPileHeight) floorMap[tx] += amount;
        }
    }
    pileCtx.save(); pileCtx.fillStyle = p.color; pileCtx.shadowBlur = 8;
    pileCtx.font = `${p.size * 0.8}px serif`; pileCtx.textAlign = 'center'; pileCtx.textBaseline = 'middle';
    pileCtx.fillText('✦', p.x, p.y); pileCtx.restore();
}

function clearStardust() { if (pileCtx) { pileCtx.clearRect(0, 0, pileCanvas.width, pileCanvas.height); floorMap.fill(0); activeParticles = []; } }

function createParticle(x, y, vx, vy, color, size) {
    if (activeParticles.length > maxActiveParticles) return;
    activeParticles.push({ x, y, vx, vy, color, size, friction: 0.95, gravity: 0.22, type: 'star' });
}

function initStarTrail() {
    let lastX = 0, lastY = 0;
    $(document).on('mousemove', (e) => {
        if (!isEffectEnabled) return;
        const cx = e.clientX, cy = e.clientY;
        if (lastX === 0) { lastX = cx; lastY = cy; }
        const dist = Math.hypot(cx - lastX, cy - lastY);
        const count = Math.max(1, Math.min(6, Math.floor(dist / 15)));
        for (let i = 0; i < count; i++) {
            const r = i / count;
            createParticle(lastX + (cx - lastX) * r, lastY + (cy - lastY) * r, (Math.random() - 0.5) * 1.5, Math.random() * 2 + 0.5, '#fff', Math.random() * 12 + 12);
        }
        lastX = cx; lastY = cy;
    });
}

function initStarClick() {
    const explosion = (e) => {
        if (!isEffectEnabled) return;
        // [FIX] 클릭 제한 강화: 200ms -> 400ms로 상향 (렉 방지)
        const now = Date.now();
        if (now - lastClickTime < 400) return;
        lastClickTime = now;

        const x = e.clientX, y = e.clientY;
        // [OPTIMIZE] 입자 개수를 25 -> 18개로 조정하여 성능 최적화
        for (let i = 0; i < 18; i++) {
            const dY = (Math.random() - 0.5) * 10, dX = (Math.random() - 0.5) * 15;
            createParticle(x, y, dX, dY, '#fff', Math.random() * 14 + 18);
        }
    };
    window.addEventListener('pointerdown', explosion, { capture: true, passive: true });
}
