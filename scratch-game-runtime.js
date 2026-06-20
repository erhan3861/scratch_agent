(() => {
    "use strict";

    const CONFIG = Object.freeze({
        editorUrl: "https://sheeptester.github.io/scratch-gui/",
        jszipUrl: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
        locale: "tr",
        stageAssetId: "b0000000000000000000000000000000",
        defaultStageColor: "#0f172a",
        defaultSpriteColor: "#8b5cf6"
    });

    const COMMANDS = Object.freeze({
        olay_bayrak: "event_whenflagclicked",
        kontrol_surekli: "control_forever",
        kontrol_eger: "control_if",
        kontrol_bekle: "control_wait",
        kontrol_durdur: "control_stop",
        hareket_xy_git: "motion_gotoxy",
        hareket_yone_don: "motion_pointindirection",
        hareket_adim_git: "motion_movesteps",
        hareket_kenardaysa_sek: "motion_ifonedgebounce",
        hareket_derece_don: "motion_turnright",
        hareket_x_yap: "motion_setx",
        hareket_y_yap: "motion_sety",
        hareket_x_degistir: "motion_changexby",
        hareket_y_degistir: "motion_changeyby",
        gorunum_soyle: "looks_say",
        gorunum_goster: "looks_show",
        gorunum_gizle: "looks_hide"
    });

    const STYLE = `
        *{box-sizing:border-box}
        html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#0b1020}
        #scratch-game-root{position:fixed;inset:0;background:#0b1020}
        #scratch-game-frame{display:block;width:100%;height:100%;border:0;background:#c4b5fd}
        #scratch-game-loading{position:absolute;inset:0;z-index:2;display:grid;place-items:center;background:#0b1020;color:#94a3b8;font:14px system-ui,sans-serif}
        #scratch-game-loading[hidden]{display:none}
    `;

    let blockCounter = 0;
    let dependencyPromise;
    const newBlockId = () => `block_${++blockCounter}`;
    const asString = value => String(value ?? 0);
    const safeNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const safeColor = (value, fallback = CONFIG.defaultSpriteColor) =>
        /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Bağımlılık yüklenemedi: ${url}`));
            document.head.appendChild(script);
        });
    }

    function ensureDependencies() {
        if (window.JSZip) return Promise.resolve();
        if (!dependencyPromise) dependencyPromise = loadScript(CONFIG.jszipUrl);
        return dependencyPromise;
    }

    function ensureLayout() {
        if (!document.getElementById("scratch-game-style")) {
            const style = document.createElement("style");
            style.id = "scratch-game-style";
            style.textContent = STYLE;
            document.head.appendChild(style);
        }
        if (!document.getElementById("scratch-game-root")) {
            const root = document.createElement("main");
            root.id = "scratch-game-root";
            root.innerHTML = `
                <div id="scratch-game-loading">Scratch editörü hazırlanıyor...</div>
                <iframe id="scratch-game-frame" title="Sheeptester Scratch Editörü" allow="clipboard-read; clipboard-write; fullscreen" allowfullscreen></iframe>
            `;
            document.body.appendChild(root);
        }
    }

    function readEmbeddedGame() {
        const source = document.getElementById("game-code");
        if (!source) throw new Error("#game-code bulunamadı.");
        return JSON.parse(source.textContent);
    }

    function numberShadow(blocks, parentId, value, opcode = "math_number") {
        const id = newBlockId();
        blocks[id] = {
            opcode, next: null, parent: parentId, inputs: {},
            fields: {NUM: [asString(value), null]}, shadow: true, topLevel: false
        };
        return id;
    }

    function textShadow(blocks, parentId, value) {
        const id = newBlockId();
        blocks[id] = {
            opcode: "text", next: null, parent: parentId, inputs: {},
            fields: {TEXT: [String(value ?? ""), null]}, shadow: true, topLevel: false
        };
        return id;
    }

    function compileBlockList(list, blocks, parentId) {
        let firstId = null;
        let previousId = null;

        (list || []).forEach((definition, index) => {
            const opcode = COMMANDS[definition.komut];
            if (!opcode) throw new Error(`Desteklenmeyen komut: ${definition.komut}`);

            const id = newBlockId();
            if (!firstId) firstId = id;
            const block = {
                opcode, next: null, parent: index === 0 ? parentId : previousId,
                inputs: {}, fields: {}, shadow: false, topLevel: false
            };
            blocks[id] = block;
            if (previousId) blocks[previousId].next = id;
            previousId = id;

            const parameters = definition.parametreler || {};
            if (definition.komut === "hareket_xy_git") {
                block.inputs.X = [1, numberShadow(blocks, id, parameters.X)];
                block.inputs.Y = [1, numberShadow(blocks, id, parameters.Y)];
            } else if (definition.komut === "hareket_yone_don") {
                block.inputs.DIRECTION = [1, numberShadow(blocks, id, parameters.DIRECTION, "math_angle")];
            } else if (definition.komut === "hareket_adim_git") {
                block.inputs.STEPS = [1, numberShadow(blocks, id, parameters.STEPS)];
            } else if (definition.komut === "hareket_derece_don") {
                block.inputs.DEGREES = [1, numberShadow(blocks, id, parameters.DEGREES)];
            } else if (definition.komut === "hareket_x_degistir") {
                block.inputs.DX = [1, numberShadow(blocks, id, parameters.X)];
            } else if (definition.komut === "hareket_y_degistir") {
                block.inputs.DY = [1, numberShadow(blocks, id, parameters.Y)];
            } else if (definition.komut === "kontrol_bekle") {
                block.inputs.DURATION = [1, numberShadow(blocks, id, parameters.SECONDS)];
            } else if (definition.komut === "gorunum_soyle") {
                block.inputs.MESSAGE = [1, textShadow(blocks, id, parameters.MESSAGE)];
            } else if (definition.komut === "hareket_x_yap") {
                if (parameters.X === "fare_x") {
                    const reporterId = newBlockId();
                    blocks[reporterId] = {
                        opcode: "sensing_mousex", next: null, parent: id,
                        inputs: {}, fields: {}, shadow: false, topLevel: false
                    };
                    block.inputs.X = [3, reporterId, [4, "0"]];
                } else {
                    block.inputs.X = [1, numberShadow(blocks, id, parameters.X)];
                }
            } else if (definition.komut === "hareket_y_yap") {
                if (parameters.Y === "fare_y") {
                    const reporterId = newBlockId();
                    blocks[reporterId] = {
                        opcode: "sensing_mousey", next: null, parent: id,
                        inputs: {}, fields: {}, shadow: false, topLevel: false
                    };
                    block.inputs.Y = [3, reporterId, [4, "0"]];
                } else {
                    block.inputs.Y = [1, numberShadow(blocks, id, parameters.Y)];
                }
            }

            if (definition.sart && definition.sart.komut === "algilama_degiyormu") {
                const reporterId = newBlockId();
                const menuId = newBlockId();
                blocks[menuId] = {
                    opcode: "sensing_touchingobjectmenu", next: null, parent: reporterId,
                    inputs: {}, fields: {TOUCHINGOBJECTMENU: [String(definition.sart.hedef), null]},
                    shadow: true, topLevel: false
                };
                blocks[reporterId] = {
                    opcode: "sensing_touchingobject", next: null, parent: id,
                    inputs: {TOUCHINGOBJECTMENU: [1, menuId]}, fields: {},
                    shadow: false, topLevel: false
                };
                block.inputs.CONDITION = [2, reporterId];
            }

            if (definition.alt_bloklar) {
                const substackId = compileBlockList(definition.alt_bloklar, blocks, id);
                if (substackId) block.inputs.SUBSTACK = [2, substackId];
            }

            if (definition.komut === "kontrol_durdur") {
                block.fields.STOP_OPTION = ["all", null];
                block.mutation = {tagName: "mutation", children: [], hasnext: "false"};
            }
        });
        return firstId;
    }

    function costumeFor(character, index) {
        const appearance = character.gorunum || {};
        const width = Math.max(4, safeNumber(appearance.genislik, 60));
        const height = Math.max(4, safeNumber(appearance.yukseklik, 60));
        const color = safeColor(appearance.renk);
        const assetId = `a${String(index + 1).padStart(31, "0")}`;
        const shape = appearance.sekil === "daire"
            ? `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${color}"/>`
            : `<rect width="${width}" height="${height}" rx="${Math.min(10, height / 2)}" fill="${color}"/>`;
        return {
            assetId, width, height,
            svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shape}</svg>`
        };
    }

    function compileGame(model) {
        if (!model || !Array.isArray(model.karakterler) || !model.karakterler.length) {
            throw new Error("karakterler dizisi boş olamaz.");
        }

        blockCounter = 0;
        const stageColor = safeColor(model.sahne_renk, CONFIG.defaultStageColor);
        const assets = new Map([[
            `${CONFIG.stageAssetId}.svg`,
            `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="${stageColor}"/></svg>`
        ]]);
        const targets = [{
            isStage: true, name: "Stage", variables: {}, lists: {}, broadcasts: {},
            blocks: {}, comments: {}, currentCostume: 0,
            costumes: [{
                assetId: CONFIG.stageAssetId, name: "Arka Plan",
                md5ext: `${CONFIG.stageAssetId}.svg`, dataFormat: "svg",
                rotationCenterX: 240, rotationCenterY: 180
            }],
            sounds: [], volume: 100, layerOrder: 0
        }];

        model.karakterler.forEach((character, index) => {
            if (!character.isim) throw new Error(`${index + 1}. karakterin ismi eksik.`);
            const blocks = {};
            (character.akislar || []).forEach((flow, flowIndex) => {
                if (flow.tetikleyici !== "olay_bayrak") {
                    throw new Error(`${character.isim}: desteklenmeyen tetikleyici ${flow.tetikleyici}`);
                }
                const eventId = newBlockId();
                blocks[eventId] = {
                    opcode: "event_whenflagclicked", next: null, parent: null,
                    inputs: {}, fields: {}, shadow: false, topLevel: true,
                    x: 50 + flowIndex * 240, y: 50
                };
                blocks[eventId].next = compileBlockList(flow.bloklar, blocks, eventId);
            });

            const costume = costumeFor(character, index);
            assets.set(`${costume.assetId}.svg`, costume.svg);
            targets.push({
                isStage: false, name: String(character.isim), variables: {}, lists: {},
                broadcasts: {}, blocks, comments: {}, currentCostume: 0,
                costumes: [{
                    assetId: costume.assetId, name: `${character.isim} Kostümü`, bitmapResolution: 1,
                    md5ext: `${costume.assetId}.svg`, dataFormat: "svg",
                    rotationCenterX: costume.width / 2, rotationCenterY: costume.height / 2
                }],
                sounds: [], volume: 100, layerOrder: index + 1, visible: true,
                x: safeNumber(character.ilk_x, 0), y: safeNumber(character.ilk_y, 0),
                size: safeNumber(character.boyut, 100), direction: safeNumber(character.yon, 90),
                draggable: false, rotationStyle: "all around"
            });
        });

        return {
            project: {
                targets,
                meta: {semver: "3.0.0", vm: "0.2.0", agent: "AI-Sheeptester-Compiler"}
            },
            assets
        };
    }

    function createZip(model) {
        const compiled = compileGame(model);
        const zip = new window.JSZip();
        zip.file("project.json", JSON.stringify(compiled.project));
        compiled.assets.forEach((content, filename) => zip.file(filename, content));
        return {zip, targetCount: compiled.project.targets.length};
    }

    function editorPlugin(targetCount) {
        const code = `(() => {
            const expectedTargets=${targetCount};let timer,stopTimer;
            const prepare=()=>{
                const logo=document.querySelector('img[alt="Scratch"]');
                if(logo)logo.style.visibility='hidden';
                const ready=window.vm&&window.vm.runtime&&window.vm.runtime.targets.length>=expectedTargets&&document.querySelector('.blocklyBlockCanvas');
                const loader=document.querySelector('[class*="loader_background"]');
                if(ready&&loader){loader.remove();clearInterval(timer);clearTimeout(stopTimer)}
            };
            timer=setInterval(prepare,200);window.addEventListener('load',prepare);
            stopTimer=setTimeout(()=>{prepare();clearInterval(timer)},15000);
        })();`;
        return `data:text/javascript;base64,${btoa(code)}`;
    }

    async function load(input) {
        ensureLayout();
        const loading = document.getElementById("scratch-game-loading");
        const frame = document.getElementById("scratch-game-frame");
        loading.hidden = false;
        try {
            await ensureDependencies();
            const model = typeof input === "string" ? JSON.parse(input) : (input || readEmbeddedGame());
            const {zip, targetCount} = createZip(model);
            const base64 = await zip.generateAsync({
                type: "base64", compression: "DEFLATE", compressionOptions: {level: 9}
            });
            const editor = new URL(CONFIG.editorUrl);
            editor.searchParams.set("locale", CONFIG.locale);
            editor.searchParams.set("load_plugin", editorPlugin(targetCount));
            editor.hash = `data:application/x.scratch.sb3;base64,${base64}`;
            frame.onload = () => { loading.hidden = true; };
            frame.onerror = () => { loading.textContent = "Editör yüklenemedi."; };
            frame.src = editor.toString();
        } catch (error) {
            loading.textContent = `Hata: ${error.message}`;
            throw error;
        }
    }

    async function download(input) {
        await ensureDependencies();
        const model = typeof input === "string" ? JSON.parse(input) : (input || readEmbeddedGame());
        const {zip} = createZip(model);
        const blob = await zip.generateAsync({type: "blob", compression: "DEFLATE"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${String(model.oyun_adi || "AI_Oyunu").replace(/[^a-z0-9_-]+/gi, "_")}.sb3`;
        link.click();
        URL.revokeObjectURL(url);
    }

    window.ScratchGame = Object.freeze({load, download});
    window.loadAIGame = load;

    const start = () => load().catch(error => console.error(error));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
