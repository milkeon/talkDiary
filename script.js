let db, ai, model;

const state = {
    apiKey: '',
    userName: '',
    preferredTone: 'banmal', // 'banmal' or 'jondaemal'
    selectedDate: new Date().toISOString().split('T')[0],
    isProcessing: false,
    chatHistory: [],
    authMode: 'selection', // 'selection', 'login', 'signup'
    selectedUserForLogin: null
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
당신은 'talkDiary'의 세심한 기록가이자 친구입니다. 사용자(${userName})의 오늘을 깊이 있게 듣고 기록하세요.
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

    $('.logo').css('cursor', 'pointer').on('click', () => {
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
    initStars(); // 배경 별빛 초기화
    initStarTrail(); // 마우스 트레일 초기화
    initStarClick(); // [RESTORED] 은색 별빛 Clicksplosion 초기화
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
    const hamsterImg = "assets/hamster_profile.png";

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
    $('#user-selection-view, #login-view, #signup-view').hide();
    if (mode === 'selection') $('#user-selection-view').show();
    else if (mode === 'login') {
        $('#login-view').show();
        $('#login-password').focus(); // 인풋 자동 포커스
    }
    else if (mode === 'signup') {
        $('#signup-view').show();
        $('#signup-name').focus(); // 인풋 자동 포커스
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

    startChat();
}

function logout(skipConfirm = false) {
    if (!skipConfirm && !confirm('로그아웃 하시겠습니까?')) return;
    state.userName = '';
    state.chatHistory = [];
    $('#chat-messages').empty();
    $('.app-container').hide();
    $('#auth-overlay').show();
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
        // createdAt 기준으로 내림차순 정렬
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

    const stopWords = ["그만", "끝", "다음에", "나중에", "졸려", "자야지", "피곤해", "안녕"];
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
    } finally { state.isProcessing = false; }
}

async function generateAIDiary() {
    addMessage("bot", `${state.userName}님의 소중한 오늘을 차분하게 갈무리해 볼게요... ✨`);
    showTyping();
    try {
        const diaryModel = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        const prompt = `당신은 오늘 하루를 보낸 사용자 본인입니다. 대화 속에 등장하는 AI가 작성을 대신해주는 것이 아니라, **당신이 대화 상대(AI)와 이야기를 나눈 뒤 직접 쓰는 개인적인 일기**를 작성하세요.
        
작성 원칙:
1. **완벽한 빙의**: 당신은 대화 속의 사용자가 되어야 합니다. 대화 상대(AI)가 내 말을 잘못 기억해서 사과했다면, "대화 상대가 내 어제 기록을 잘못 말해서 조금 당황했다"는 식으로 나의 기분을 적으세요.
2. **나의 관점**: AI의 입장에서 "사용자에게 위로를 건넸다"라고 쓰지 마세요. "그의 위로 덕분에 조금 힘이 났다"라고 쓰세요.
3. **사실 기반 일상**: 오늘 나눈 대화(날씨, 고정지출 정리, 게임에 관한 생각 등)를 바탕으로 나의 내면적인 고백과 오늘 있었던 일들을 담백하게 기록하세요.
4. **호칭 주의**: 특정 이름이나 닉네임은 한 번도 등장하지 않아야 합니다. 오직 '나'를 주어로 사용하여 성숙한 에세이 스타일로 완성하세요.`;

        const result = await diaryModel.generateContent(prompt + "\n\n[대화 내용]\n" + JSON.stringify(state.chatHistory));
        const finalDiary = result.response.text();
        hideTyping();
        addMessage("bot", `### ✨ 오늘의 일기 기록<br>\n\n${finalDiary.replace(/\n/g, '<br>')}`);
        await saveToFirebase(finalDiary, state.chatHistory);
    } catch (e) {
        hideTyping();
        console.error("Diary error:", e);
        addMessage("bot", "일기 작성 중 오류가 생겼습니다.");
    }
}

async function saveToFirebase(content, history) {
    if (!db || !state.userName) return;
    const { collection, addDoc, Timestamp } = window.firebaseFirestore;
    const logs = history.filter((h, i) => i > 0).map(h => ({
        role: h.role === 'user' ? '사용자' : 'AI',
        message: h.parts[0].text.replace("[DIARY_READY]", "").trim()
    }));
    try {
        const diaryDate = new Date(state.selectedDate);
        await addDoc(collection(db, "diaries"), {
            userName: state.userName,
            date: Timestamp.fromDate(diaryDate),
            content: content,
            chatLogs: logs,
            timestamp: Date.now()
        });
        addMessage("bot", "✅ 오늘 하루도 고생 많았어. 기록이 안전하게 저장되었어! 👍");
        await checkAndGenerate3DaySummary();
    } catch (e) {
        console.error("Save failed:", e);
        addMessage("bot", "❌ 미안, 기록을 저장하는 중에 예기치 못한 오류가 발생했어. 나중에 다시 시도해줄래?");
    }
}

async function checkAndGenerate3DaySummary() {
    if (!ai || !db || !state.userName) return;
    const { collection, getDocs, query, where, addDoc } = window.firebaseFirestore;
    try {
        // 내 일기 모두 가져오기
        const q = query(
            collection(db, "diaries"),
            where("userName", "==", state.userName)
        );
        const dSnap = await getDocs(q);
        if (dSnap.empty) return;

        let myDiaries = dSnap.docs.map(doc => doc.data());
        // 날짜순 내림차순 정렬 후 최근 3개만 추출
        myDiaries.sort((a, b) => b.date.seconds - a.date.seconds);
        myDiaries = myDiaries.slice(0, 3);

        if (myDiaries.length < 3) return;

        // 기간 설정
        const last3Days = [...myDiaries].reverse();
        const startTimestamp = last3Days[0].date;
        const endTimestamp = last3Days[2].date;

        // 해당 기간에 대한 요약이 이미 있는지 확인 (중복 방지)
        const checkQ = query(
            collection(db, "summaries"),
            where("userName", "==", state.userName),
            where("startDate", "==", startTimestamp),
            where("endDate", "==", endTimestamp)
        );
        const existingSummary = await getDocs(checkQ);
        if (!existingSummary.empty) return;

        const diaryText = last3Days.map((d) => {
            const dateStr = d.date.toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
            return `[${dateStr} 일기]\n${d.content}`;
        }).join("\n\n");

        const summaryModel = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        const prompt = `당신은 지난 3일간의 기록을 가진 사용자 본인입니다. 대화 속에 등장하는 기록가가 분석해주는 형식이 아니라, **사용자인 당신이 자신의 지난 3일을 스스로 돌아보며 쓰는 성찰록**이어야 합니다.
        
집필 지침:
1. **AI 정체성 제거**: "기록가로서 분석했다" 혹은 "사용자를 응원한다" 같은 표현은 절대 금지입니다. 당신은 분석을 받는 대상이 아니라, 분석을 하는 주체입니다.
2. **나의 성장기**: "지난 3일간 나는 이런 변화를 겪었다"는 식으로 '나'를 주인공으로 내세우세요.
3. **연결성**: 요약 날짜 범위 내의 내용들을 하나의 흐름으로 묶어보세요.
4. **몰입감**: 반드시 1인칭('나')으로만 서술하며, 격조 있는 문체로 마무리하세요.`;

        const result = await summaryModel.generateContent(prompt + "\n\n" + diaryText);
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
    requestAnimationFrame(() => {
        $('#chat-messages').scrollTop($('#chat-messages')[0].scrollHeight);
    });
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
        const q = query(
            collection(db, "diaries"),
            where("userName", "==", state.userName)
        );
        const qs = await getDocs(q);
        if (qs.empty) {
            $('#history-list').html('<p class="no-data" style="grid-column: 1/-1; text-align:center; padding: 3rem; color:var(--text-secondary);">아직 기록된 일기가 없습니다. 대화를 시작해보세요!</p>');
            return;
        }

        const myDiaries = qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // 날짜순 내림차순 정렬 (가장 최근 것이 위로)
        myDiaries.sort((a, b) => b.date.seconds - a.date.seconds);

        const list = $('#history-list');
        list.empty();
        myDiaries.forEach(data => {
            const d = data.date.toDate();
            const dateStr = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
            const card = $(`
                <div class="history-card" title="클릭해서 상세보기">
                    <div class="date">${dateStr}</div>
                    <div class="title">${state.userName}님의 기록</div>
                    <div class="preview">${data.content}</div>
                </div>
            `);
            card.on('click', () => openDiaryModal(data));
            list.append(card);
        });
    } catch (e) { console.error("Load history error:", e); }
}

function openDiaryModal(diary) {
    const d = diary.date.toDate();
    const dateStr = d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    $('#modal-date').text(dateStr);
    $('#modal-title').text(`${state.userName}님의 기록`);
    $('#modal-diary-content').html(diary.content.replace(/\n/g, '<br>'));
    $('#diary-modal').fadeIn(300);
}

async function loadSummaries() {
    if (!db || !state.userName) return;
    const { collection, getDocs, query, where } = window.firebaseFirestore;
    try {
        const q = query(
            collection(db, "summaries"),
            where("userName", "==", state.userName)
        );
        const qs = await getDocs(q);
        if (qs.empty) {
            $('#weekly-overview').html('<p class="no-data">기록이 쌓이면 인공지능이 3일마다 요약을 생성해 줍니다. ✨</p>');
            return;
        }

        const mySummaries = qs.docs.map(doc => doc.data());
        // 생성일 기준 내림차순 정렬
        mySummaries.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        let html = '';
        mySummaries.forEach(d => {
            const start = d.startDate.toDate();
            const end = d.endDate.toDate();
            const startStr = `${start.getMonth() + 1}/${start.getDate()}`;
            const endStr = `${end.getMonth() + 1}/${end.getDate()}`;
            const rangeStr = (startStr === endStr) ? startStr : `${startStr} ~ ${endStr}`;
            html += `
                <div class="summary-card">
                    <h3 style="color:var(--accent-light)">📅 ${rangeStr} 요약</h3>
                    <div class="summary-content">${d.content.replace(/\n/g, '<br>')}</div>
                </div>
            `;
        });
        $('#weekly-overview').html(html);
        generateWeeklyStats();
    } catch (e) { console.error("Load summaries error:", e); }
}

async function generateWeeklyStats() {
    if (!ai || !db || !state.userName || $('#mood-stats').length === 0) return;
    const { collection, getDocs, query, where } = window.firebaseFirestore;
    try {
        const q = query(
            collection(db, "diaries"),
            where("userName", "==", state.userName)
        );
        const dSnap = await getDocs(q);
        if (dSnap.empty) return;

        let myDiaries = dSnap.docs.map(doc => doc.data());
        // 정렬 후 최근 7개만 사용
        myDiaries.sort((a, b) => b.date.seconds - a.date.seconds);
        myDiaries = myDiaries.slice(0, 7);

        const allContent = myDiaries.map(d => d.content).join("\n");
        const statsModel = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        const prompt = `다음 일기 내용들을 분석하여 사용자의 현재 '주간 기분 토템(이모지/점수)'과 '핵심 키워드 3개'를 추출해줘. JSON 형식으로만 답해. 예시: { "mood": "🌈", "score": 85, "keywords": ["기획", "성장", "공부"], "desc": "밝고 긍정적인 에너지가 느껴져요." }`;
        const result = await statsModel.generateContent(prompt + "\n\n" + allContent);
        const statsText = result.response.text().replace(/```json|```/g, "").trim();
        const stats = JSON.parse(statsText);
        $('#mood-stats').html(`
            <div class="stat-item">
                <span class="mood-badge">${stats.mood}</span>
                <div>
                    <div style="font-weight:700; font-size:1.3rem; color:#fff;">${stats.score}점</div>
                    <div style="font-size:0.85rem; color:var(--text-secondary);">${stats.desc}</div>
                </div>
            </div>
        `);
        $('#keyword-stats').html(stats.keywords.map(k => `<span class="keyword-chip"># ${k}</span>`).join(""));
    } catch (e) { console.error("Stats engine error:", e); }
}

// 밤하늘 별빛 배경 초기화 (Twinkling Stars)
function initStars() {
    const container = document.querySelector('.star-container');
    if (!container) return;

    const starCount = 200; // 렉 방지를 위해 밀도 최적화 (600 -> 200)
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.classList.add('star');

        // 무작위 크기 (1px ~ 3px)
        const size = Math.random() * 2 + 1;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;

        // 무작위 위치
        star.style.left = `${Math.random() * 100}vw`;
        star.style.top = `${Math.random() * 100}vh`;

        // 무작위 애니메이션 속성
        const duration = Math.random() * 3 + 2;
        const opacity = Math.random() * 0.7 + 0.3;
        star.style.setProperty('--duration', `${duration}s`);
        star.style.setProperty('--opacity', opacity);
        star.style.animationDelay = `${Math.random() * 5}s`;

        container.appendChild(star);
    }
}

// 마우스 트레일 별가루 효과 (Star Dust Trail) - 부드러운 보간 로직 복구
function initStarTrail() {
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    const throttle = 16; // 고주사율을 위한 정밀 포착

    $(document).on('mousemove', (e) => {
        const now = Date.now();
        const currentX = e.clientX;
        const currentY = e.clientY;

        if (lastX === 0 && lastY === 0) {
            lastX = currentX;
            lastY = currentY;
        }

        const dist = Math.hypot(currentX - lastX, currentY - lastY);
        // 이동 거리만큼 입자를 촘촘하게 채워 넣음 (Lerp)
        const count = Math.max(3, Math.min(25, Math.floor(dist / 4)));

        for (let i = 0; i < count; i++) {
            const ratio = i / count;
            const x = lastX + (currentX - lastX) * ratio;
            const y = lastY + (currentY - lastY) * ratio;

            const star = document.createElement('div');
            star.classList.add('star-trail');

            const offset = 15;
            const finalX = x + (Math.random() * offset - offset / 2);
            const finalY = y + (Math.random() * offset - offset / 2);

            star.style.left = `${finalX}px`;
            star.style.top = `${finalY}px`;

            const size = Math.random() * 4 + 2;
            star.style.width = `${size}px`;
            star.style.height = `${size}px`;
            // [RESTORED] 이전의 가장 천천히 부드러운 수명 (1.2s ~ 2.5s)
            const duration = Math.random() * 1.3 + 1.2;
            star.style.animationDuration = `${duration}s`;

            document.body.appendChild(star);

            setTimeout(() => {
                star.remove();
            }, duration * 1000);
        }

        lastX = currentX;
        lastY = currentY;
    });
}

// 클릭 시 은색 유성우 Clicksplosion 효과 (Final Global Robustness Update)
// 클릭 시 은색 유성우 Clicksplosion 효과 (Final Ultimate Resilience & HTML-Root Appending)
function initStarClick() {
    const sparksCount = 45; 
    const friction = 0.94; 
    const silverColours = ['#ffffff', '#f8f9fa', '#f1f3f5', '#fff4e6', '#e9ecef'];

    const explodeHandler = (e) => {
        // 좌표 획득 (pageX/pageY를 사용하되, fixed 포지션을 위해 scroll 보정)
        const x = e.clientX || (e.pageX - window.pageXOffset);
        const y = e.clientY || (e.pageY - window.pageYOffset);
        
        if (x === undefined || y === undefined) return;

        const intensity = 8 + Math.random() * 6;

        for (let i = 0; i < sparksCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'spark-particle';
            
            // html 태그에 직접 붙여 그 어떤 레이아웃 간섭도 피함
            particle.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                pointer-events: none;
                z-index: 2147483647;
                color: ${silverColours[Math.floor(Math.random() * silverColours.length)]};
                font-size: ${Math.random() * 12 + 16}px;
                font-weight: bold;
                will-change: transform, opacity;
                line-height: 1;
                filter: drop-shadow(0 0 10px #fff);
                text-shadow: 0 0 10px rgba(255,255,255,0.8);
            `;
            particle.innerHTML = '✦'; 
            
            let px = x;
            let py = y;
            
            let dY = (Math.random() - 0.5) * intensity;
            let dX = (Math.random() - 0.5) * (intensity - Math.abs(dY)) * 1.5;
            
            let life = 1.0;
            const decay = Math.random() * 0.015 + 0.012; 

            // 유일한 전역 노드인 html에 추가
            document.documentElement.appendChild(particle);

            function update() {
                dX *= friction;
                dY *= friction;
                dY += 0.25; 
                
                px += dX;
                py += dY;
                
                life -= decay;
                
                particle.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${life})`;
                particle.style.opacity = life;

                if (life > 0) {
                    requestAnimationFrame(update);
                } else {
                    particle.remove();
                }
            }
            requestAnimationFrame(update);
        }
    };

    // 최상위 window에 pointerdown 이벤트를 캡처링 모드로 등록 (최강의 우선순위)
    window.addEventListener('pointerdown', explodeHandler, { capture: true, passive: true });
}
