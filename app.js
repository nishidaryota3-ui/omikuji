const SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';

let haikuDatabase = [];    // 全データ
let haikuHistory = [];     // ランダムシャッフルされた閲覧順リスト
let historyIndex = 0;      // 現在の履歴位置
let isInfoOpen = false;

// スワイプ検知変数
let touchStartX = 0;
let touchStartY = 0;

window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // 1. キャッシュの即時復元（オフライン・爆速起動対策）
    restoreCachedData();

    // 2. スプレッドシートからの最新データの非同期取得
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?range=A:H&tqx=responseHandler:mainDataReceived`;
    document.body.appendChild(script);

    // 操作イベントの初期化
    initEventListeners();
};

// ローカルストレージからのキャッシュ復元
function restoreCachedData() {
    try {
        const cached = localStorage.getItem('omikuji_light_database');
        if (cached) {
            haikuDatabase = JSON.parse(cached);
            if (haikuDatabase.length > 0) {
                setupHaikuHistory();
                displayCurrentHaiku(false);
            }
        }
    } catch (e) {
        console.error('キャッシュ復元エラー:', e);
    }
}

// データ受信処理
window.mainDataReceived = function(data) {
    try {
        const rows = data.table.rows;
        
        const rawList = rows.map(r => {
            const getVal = (colIdx) => (r.c && r.c[colIdx] && r.c[colIdx].v !== null) ? String(r.c[colIdx].v) : '';
            return {
                haiku: getVal(0).trim(),       // A列: 俳句
                author: getVal(1).trim(),      // B列: 作者名
                kigo: getVal(3).trim(),        // D列: 季語
                seasonDetail: getVal(7).trim() // H列: 詳細季節
            };
        }).filter(item => item.haiku !== '' && item.haiku !== '俳句' && item.haiku !== '句');

        if (rawList.length > 0) {
            haikuDatabase = rawList;
            localStorage.setItem('omikuji_light_database', JSON.stringify(haikuDatabase));

            // 初回読み込み・または更新時
            if (haikuHistory.length === 0) {
                setupHaikuHistory();
                displayCurrentHaiku(false);
            }
        } else if (haikuDatabase.length === 0) {
            document.getElementById('haikuStage').innerText = '俳句が見つかりません';
        }
    } catch (e) {
        console.error(e);
        if (haikuDatabase.length === 0) {
            document.getElementById('haikuStage').innerText = '読み込みエラーが発生しました';
        }
    }
};

// ランダムシャッフル履歴の初期構築
function setupHaikuHistory() {
    haikuHistory = [...haikuDatabase];
    for (let i = haikuHistory.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [haikuHistory[i], haikuHistory[j]] = [haikuHistory[j], haikuHistory[i]];
    }
    historyIndex = 0;
}

// 句の進む・戻る移動（季寄せと同じ方向感：+1で未来へ進む、-1で過去に戻る）
function changeHaiku(direction) {
    if (isInfoOpen) toggleInfo(false);

    if (direction > 0) {
        // 次の句へ進む
        if (historyIndex < haikuHistory.length - 1) {
            historyIndex++;
        } else {
            // 一巡したら再シャッフル
            setupHaikuHistory();
        }
    } else if (direction < 0) {
        // 前の句へ戻る
        if (historyIndex > 0) {
            historyIndex--;
        } else {
            return; // 最初の句なら戻らない
        }
    }

    displayCurrentHaiku(true);
}

// 現在の句を表示
function displayCurrentHaiku(withAnimation) {
    if (haikuHistory.length === 0) return;

    const stage = document.getElementById('haikuStage');
    const currentItem = haikuHistory[historyIndex];

    const render = () => {
        // 俳句本文
        const text = currentItem.haiku;
        stage.textContent = text;

        // 文字数に応じた文字間隔の自動計算
        const charCount = text.length;
        let spacing = 0.15;
        if (charCount > 14) {
            spacing = Math.max(0.01, 0.15 - ((charCount - 14) * 0.025));
        }
        stage.style.letterSpacing = `${spacing}em`;

        // 右上情報データ
        const kigo = currentItem.kigo || '';
        const season = currentItem.seasonDetail ? `（${currentItem.seasonDetail}）` : '';
        document.getElementById('infoKigoSeason').textContent = `${kigo}${season}`;
        document.getElementById('infoAuthor').textContent = currentItem.author || '';

        // 矢印ボタンの表示状態制御
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (historyIndex === 0) {
            prevBtn.classList.add('disabled');
        } else {
            prevBtn.classList.remove('disabled');
        }

        if (withAnimation) stage.classList.remove('fade-out');
    };

    if (withAnimation) {
        stage.classList.add('fade-out');
        setTimeout(render, 200);
    } else {
        render();
    }
}

// i ボタン表示切り替え
function toggleInfo(show) {
    isInfoOpen = show;
    const infoBtn = document.getElementById('infoBtn');
    const infoDisplay = document.getElementById('infoDisplay');

    if (isInfoOpen) {
        infoBtn.style.opacity = '0';
        infoDisplay.classList.add('active');
    } else {
        infoBtn.style.opacity = '0.6';
        infoDisplay.classList.remove('active');
    }
}

// 操作イベントの集約設定
function initEventListeners() {
    const container = document.getElementById('app-container');
    const infoBtn = document.getElementById('infoBtn');
    const infoDisplay = document.getElementById('infoDisplay');

    // 1. iボタンタップ
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInfo(!isInfoOpen);
    });

    infoDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInfo(false);
    });

    // 2. 画面タップ（iボタン以外のタップで次の句へ進む）
    container.addEventListener('click', (e) => {
        if (e.target.closest('#infoBtn') || e.target.closest('#infoDisplay') || e.target.closest('.nav-arrow')) return;

        if (isInfoOpen) {
            toggleInfo(false);
            return;
        }

        changeHaiku(1);
    });

    // 3. スワイプ操作（季寄せと共通の感覚）
    container.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
        if (e.target.closest('#infoBtn') || e.target.closest('#infoDisplay')) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // 横スワイプ判定
        if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 0) {
                changeHaiku(1);  // 右スワイプで進む
            } else {
                changeHaiku(-1); // 左スワイプで戻る
            }
        }
    }, { passive: true });

    // 4. キーボード操作
    document.addEventListener('keydown', (e) => {
        if (['ArrowRight', ' '].includes(e.key)) {
            changeHaiku(1);
        } else if (e.key === 'ArrowLeft') {
            changeHaiku(-1);
        } else if (e.key === 'i' || e.key === 'I') {
            toggleInfo(!isInfoOpen);
        }
    });
}
