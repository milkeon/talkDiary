let db, ai, model;

const state = {
    diaryContent: '',
    apiKey: '',
    userName: '',
    preferredTone: 'banmal', // 'banmal' or 'jondaemal'
    setupStep: -1, // -1: loading, 0: name, 1: tone, 2: completed
    selectedDate: new Date().toISOString().split('T')[0],
    isProcessing: false,
    chatHistory: []
};

// [요구사항 3, 5, 7] 시스템 프롬프트: 어제의 기억과 세련된 문체를 위한 지침
function getSystemPrompt(userName, tone, recentSummary = "") {
    const toneStyle = tone === 'banmal'
        ? "친구처럼 다정하고 편안한 반말로 대화하세요. 젬스를 소중히 대하세요."
        : "정중하고 예의 바른 존댓말로 따뜻하게 대화하세요. 젬스를 존중하세요.";

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
    initUI();
    const env = await loadEnv();
    state.apiKey = env.GEMINI_API_KEY;
    if (state.apiKey) initAI();
    initFirebase(env);

    $('#send-btn').on('click', handleUserInput);
    $('#user-input').on('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserInput(); } });
    $('.nav-links li').on('click', function () { switchView($(this).data('view')); });
    
    $('.close-modal').on('click', () => $('#diary-modal').hide());
    $(window).on('click', (e) => { if ($(e.target).is('#diary-modal')) $('#diary-modal').hide(); });

    $('#date-selector').on('change', function () {
        state.selectedDate = $(this).val();
        $('#chat-messages').empty();
        state.chatHistory = [];
        startChat();
    });
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
        checkUserSetup();
    } catch (e) { console.error(e); }
}

async function checkUserSetup() {
    if (!db) return;
    const { doc, getDoc } = window.firebaseFirestore;
    try {
        const snap = await getDoc(doc(db, "user_prefs", "settings"));
        if (snap.exists()) {
            const data = snap.data();
            state.userName = data.userName;
            state.preferredTone = data.preferredTone;
            state.setupStep = 2;
            $('.user-profile .name').text(state.userName);
            $('.user-profile .avatar').text(state.userName.charAt(0));
        } else { state.setupStep = 0; }
        tryStartingChat();
    } catch (e) { state.setupStep = 0; tryStartingChat(); }
}

function initAI() {
    try {
        ai = new window.GoogleGenerativeAI(state.apiKey);
        model = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        tryStartingChat();
    } catch (e) { console.error(e); }
}

function tryStartingChat() { if (ai && state.setupStep !== -1) startChat(); }

async function startChat() {
    if (state.setupStep === -1 || !ai) return;
    if (state.chatHistory.length > 0) return;

    if (state.setupStep === 0) {
        addMessage("bot", "안녕하세요? 대화를 시작하기 전에, 어떻게 불러드리면 좋을까요? 😊");
    } else if (state.setupStep === 1) {
        addMessage("bot", `${state.userName}님, 반갑습니다! 제가 어떤 말투로 대화하면 좋을까요?<br>1. 친근한 반말<br>2. 정중한 존댓말`);
    } else {
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
}

async function getRecentSummary() {
    if (!db || !state.userName) return "";
    const { collection, query, orderBy, getDocs } = window.firebaseFirestore;
    try {
        const q = query(collection(db, "summaries"), orderBy("createdAt", "desc"));
        const qs = await getDocs(q);
        const myItems = qs.docs.map(d => d.data()).filter(d => d.userName === state.userName);
        return myItems.length > 0 ? myItems[0].content : "";
    } catch (e) { return ""; }
}

async function handleUserInput() {
    const input = $('#user-input').val().trim();
    if (!input || state.isProcessing) return;
    $('#user-input').val('');
    addMessage("user", input);

    if (state.setupStep < 2) { handleSetup(input); return; }
    if (!model) return;

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

    } catch (e) { hideTyping(); addMessage("bot", "잠시 오류가 생겼어. 다시 말해줘!"); }
    finally { state.isProcessing = false; }
}

async function handleSetup(input) {
    const { doc, setDoc } = window.firebaseFirestore;
    if (state.setupStep === 0) {
        state.userName = input.replace(/(라고 해|이라 그래|이야|입니다|예요|에요|라고 불러줘|라 그래|입니다)$/, "").trim();
        state.setupStep = 1;
        $('.user-profile .name').text(state.userName); $('.user-profile .avatar').text(state.userName.charAt(0));
        addMessage("bot", `${state.userName}님, 반가워요! 제가 어떤 말투로 대화하는 게 편하신가요? (반말 / 존댓말)`);
    } else if (state.setupStep === 1) {
        const val = input.toLowerCase();
        state.preferredTone = (val.includes("반말") || val.includes("친근") || val.includes("반모") || val.includes("놓자") || val.includes("편하게")) ? 'banmal' : 'jondaemal';
        state.setupStep = 2;
        try {
            await setDoc(doc(db, "user_prefs", "settings"), { userName: state.userName, preferredTone: state.preferredTone, setupAt: new Date() });
            addMessage("bot", "설정이 완료되었습니다! 이제 대화를 시작해볼까요? 😊");
            setTimeout(() => startChat(), 1500);
        } catch (e) { startChat(); }
    }
}

async function generateAIDiary() {
    addMessage("bot", "젬스님의 소중한 오늘을 차분하게 갈무리해 볼게요... ✨");
    showTyping();
    try {
        const diaryModel = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        const prompt = `당신은 오늘 하루를 보낸 사용자 본인입니다. 대화 속에 등장하는 AI가 작성을 대신해주는 것이 아니라, **당신이 대화 상대(AI)와 이야기를 나눈 뒤 직접 쓰는 개인적인 일기**를 작성하세요.
        
작성 원칙:
1. **완벽한 빙의**: 당신은 대화 속의 사용자가 되어야 합니다. 대화 상대(AI)가 내 말을 잘못 기억해서 사과했다면, "대화 상대가 내 어제 기록을 잘못 말해서 조금 당황했다"는 식으로 나의 기분을 적으세요.
2. **나의 관점**: AI의 입장에서 "사용자에게 위로를 건넸다"라고 쓰지 마세요. "그의 위로 덕분에 조금 힘이 났다"라고 쓰세요.
3. **사실 기반 일상**: 오늘 나눈 대화(날씨, 고정지출 정리, 게임에 관한 생각 등)를 바탕으로 나의 내면적인 고백과 오늘 있었던 일들을 담백하게 기록하세요.
4. **호칭 주의**: 사용자 이름이나 '젬스님' 같은 단어는 한 번도 등장하지 않아야 합니다. 오직 '나'를 주어로 사용하여 성숙한 에세이 스타일로 완성하세요.`;
        
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
        const docRef = await addDoc(collection(db, "diaries"), {
            userName: state.userName,
            date: Timestamp.fromDate(new Date(state.selectedDate)),
            content: content,
            chatLogs: logs,
            timestamp: Date.now()
        });
        console.log("Diary saved with ID:", docRef.id);
        addMessage("bot", "✅ 오늘 하루도 고생 많았어. 기록이 안전하게 저장되었어! 👍");
        await checkAndGenerate3DaySummary();
    } catch (e) {
        console.error("Save failed:", e);
        addMessage("bot", "❌ 미안, 기록을 저장하는 중에 예기치 못한 오류가 발생했어. 나중에 다시 시도해줄래?");
    }
}

async function checkAndGenerate3DaySummary() {
    if (!ai || !db || !state.userName) return;
    const { collection, getDocs, addDoc } = window.firebaseFirestore;
    try {
        const dSnap = await getDocs(collection(db, "diaries"));
        const myDiaries = dSnap.docs
            .map(doc => doc.data())
            .filter(d => d.userName === state.userName)
            .sort((a, b) => b.date.seconds - a.date.seconds);

        if (myDiaries.length < 3) return;

        const last3Days = myDiaries.slice(0, 3).reverse();
        const diaryText = last3Days.map((d) => {
            const dateStr = d.date.toDate().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
            return `[${dateStr} 일기]\n${d.content}`;
        }).join("\n\n");

        const summaryModel = ai.getGenerativeModel({ model: "gemma-3-27b-it" });
        const prompt = `당신은 지난 3일간의 기록을 가진 사용자 본인입니다. 대화 속에 등장하는 기록가가 분석해주는 형식이 아니라, **사용자인 당신이 자신의 지난 3일을 스스로 돌아보며 쓰는 성찰록**이어야 합니다.
        
집필 지침:
1. **AI 정체성 제거**: "기록가로서 분석했다" 혹은 "사용자를 응원한다" 같은 표현은 절대 금지입니다. 당신은 분석을 받는 대상이 아니라, 분석을 하는 주체입니다.
2. **나의 성장기**: "지난 3일간 나는 이런 변화를 겪었다"는 식으로 '나'를 주인공으로 내세우세요.
3. **연결성**: "${last3Days[0].date.toDate().getMonth() + 1}월 ${last3Days[0].date.toDate().getDate()}일"부터 오늘까지 내가 기록했던 내용들을 하나의 흐름으로 묶어보세요.
4. **몰입감**: 반드시 1인칭('나')으로만 서술하며, 격조 있는 문체로 마무리하세요.`;

        const result = await summaryModel.generateContent(prompt + "\n\n" + diaryText);
        const summary = result.response.text();

        await addDoc(collection(db, "summaries"), {
            userName: state.userName,
            startDate: last3Days[0].date,
            endDate: last3Days[2].date,
            content: summary,
            createdAt: new Date()
        });

        loadSummaries();
    } catch (e) { console.error(e); }
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
    const { collection, getDocs, query, where, orderBy } = window.firebaseFirestore;
    try {
        const q = query(collection(db, "diaries"), where("userName", "==", state.userName), orderBy("date", "asc"));
        const qs = await getDocs(q);
        const myDiaries = qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const list = $('#history-list');
        list.empty();
        if (myDiaries.length === 0) { list.html('<p class="no-data">기록이 없습니다.</p>'); return; }
        myDiaries.forEach(data => {
            const d = data.date.toDate();
            const dateStr = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
            const card = $(`
                <div class="history-card" title="클릭해서 상세보기">
                    <div class="date">${dateStr}</div>
                    <div class="title">${data.content.substring(0, 25)}...</div>
                    <div class="preview">${data.content}</div>
                </div>
            `);
            card.on('click', () => openDiaryModal(data));
            list.append(card);
        });
    } catch (e) { console.error(e); }
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
    const { collection, getDocs, query, where, orderBy } = window.firebaseFirestore;
    try {
        const q = query(collection(db, "summaries"), where("userName", "==", state.userName), orderBy("createdAt", "asc"));
        const qs = await getDocs(q);
        const mySummaries = qs.docs.map(doc => doc.data());
        let html = '';
        mySummaries.forEach(d => {
            const start = d.startDate ? d.startDate.toDate() : d.createdAt.toDate();
            const end = d.endDate ? d.endDate.toDate() : d.createdAt.toDate();
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
        $('#weekly-overview').html(html || '<p class="no-data">기록이 쌓이면 인공지능이 3일마다 요약을 생성해 줍니다. ✨</p>');
        generateWeeklyStats();
    } catch (e) { console.error(e); }
}

async function generateWeeklyStats() {
    if (!ai || !db || !state.userName || $('#mood-stats').length === 0) return;
    const { collection, getDocs } = window.firebaseFirestore;
    try {
        const dSnap = await getDocs(collection(db, "diaries"));
        const myDiaries = dSnap.docs
            .map(doc => doc.data())
            .filter(d => d.userName === state.userName)
            .sort((a, b) => b.date.seconds - a.date.seconds)
            .slice(0, 7);
        if (myDiaries.length === 0) return;
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
