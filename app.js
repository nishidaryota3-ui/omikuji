const SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';

let haikuDatabase = [];
let haikuHistory = [];
let historyIndex = 0;
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

    // 操作イベントの設定
    initEventListeners();
};

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

/**
 * 🌸 作者の出現頻度を完全に均等化した履歴リスト（haikuHistory）を生成する関数
 */
function setupHaikuHistory() {
    if (haikuDatabase.length === 0) return;

    // 1. 作者ごとに俳句をグループ化する
    const authorGroups = {};
    haikuDatabase.forEach(item => {
        const author = item.author || '作者不詳';
        if (!authorGroups[author]) {
            authorGroups[author] = [];
        }
        // 各作者の持っている句のリストをシャッフルして保持（被りを極力防ぐため）
        authorGroups[author].push(item);
    });

    // 作者ごとの句リストをあらかじめランダムシャッフルしておく
    Object.keys(authorGroups).forEach(author => {
        const list = authorGroups[author];
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
    });

    const authors = Object.keys(authorGroups);
    const newHistory = [];
    const totalCount = haikuDatabase.length; // データベース全件数分の履歴を作成

    // 作者ごとの現在参照インデックス
    const authorIndices = {};
    authors.forEach(a => authorIndices[a] = 0);

    // 2. 「作者を均等確率で選択」→「その作者の句を1つ追加」を繰り返して全件分生成
    while (newHistory.length < totalCount) {
        // 作者リストをランダムに1人選ぶ
        const randomAuthor = authors[Math.floor(Math.random() * authors.length)];
        const group = authorGroups[randomAuthor];

        // 選ばれた作者の句を順番に取得（末尾までいったら再度シャッフルしてループ）
        let idx = authorIndices[randomAuthor];
        if (idx >= group.length) {
            // その作者の句を一巡したら再シャッフル
            for (let i = group.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [group[i], group[j]] = [group[j], group[i]];
            }
            idx = 0;
        }

        newHistory.push(group[idx]);
        authorIndices[randomAuthor] = idx + 1;
    }

    haikuHistory = newHistory;
    historyIndex = 0;
}

function changeHaiku(direction) {
    if (isInfoOpen) toggleInfo(false);

    if (direction > 0) {
        if (historyIndex < haikuHistory.length - 1) {
            historyIndex++;
        } else {
            // 全件見終わったら再度「作者均等」で再構築
            setupHaikuHistory();
        }
    } else if (direction < 0) {
        if (historyIndex > 0) {
            historyIndex--;
        } else {
            return;
        }
    }

    displayCurrentHaiku(true);
}

// 🌸 ルビ変換処理
function formatRubyText(text) {
    if (!text) return '';
    let str = String(text);

    str = str.replace(/｜/g, '|');

    str = str.replace(/\|([^《（(]+)[《（(]([^》）)]+)[》）)]/g, function(match, targetText, rubyText) {
        return '<span class="ruby-block"><ruby>' + targetText + '<rt>' + rubyText + '</rt></ruby></span>';
    });

    str = str.replace(/([\u4E00-\u9FFF\u3005]+)[《（(]([^》）)]+)[》）)]/g, function(match, targetText, rubyText) {
        return '<span class="ruby-block"><ruby>' + targetText + '<rt>' + rubyText + '</rt></ruby></span>';
    });

    return str;
}

function displayCurrentHaiku(withAnimation) {
    if (haikuHistory.length === 0) return;

    const stage = document.getElementById('haikuStage');
    const currentItem = haikuHistory[historyIndex];

    const render = () => {
        const text = currentItem.haiku;
        stage.innerHTML = formatRubyText(text);

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

        // 矢印ボタンの表示状態
        const prevBtn = document.getElementById('prevBtn');
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

function initEventListeners() {
    const infoBtn = document.getElementById('infoBtn');
    const infoDisplay = document.getElementById('infoDisplay');

    // 1. iボタン・情報カードタップ
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInfo(!isInfoOpen);
    });

    infoDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInfo(false);
    });

    // 2. 画面タップで次の句へ
    document.addEventListener('click', (e) => {
        if (e.target.closest('#infoBtn') || e.target.closest('#infoDisplay') || e.target.closest('.nav-arrow')) return;

        if (isInfoOpen) {
            toggleInfo(false);
            return;
        }

        changeHaiku(1);
    });

    // 3. スワイプ操作（左右スワイプ）
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (e.target.closest('#infoBtn') || e.target.closest('#infoDisplay')) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

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
