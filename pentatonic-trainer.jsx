import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as Tone from "tone";
import { Play, Square, Repeat, Music2 } from "lucide-react";

/* ============================= 定数 ============================= */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NUM_FRETS = 22;

// index 0 = 1弦(high e) 〜 index 5 = 6弦(low E)
const STRINGS = [
  { num: 1, open: 4, midi: 64 },
  { num: 2, open: 11, midi: 59 },
  { num: 3, open: 7, midi: 55 },
  { num: 4, open: 2, midi: 50 },
  { num: 5, open: 9, midi: 45 },
  { num: 6, open: 4, midi: 40 },
];

const SINGLE_MARKERS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_MARKERS = [12];

/* ============================= フレーズ ============================= */
// マイナーはAm、メジャーはGで記譜。ルートに応じて自動移調（フレット3〜15の範囲で記譜）。
const n = (s, ...fr) => fr.map((f) => ({ s, f }));
const h = (s, f, hh) => ({ s, f, h: hh });   // 音を伸ばす
const R = (r = 1) => ({ r });                 // 休符

const MINOR_LICKS = [
  // --- 横移動 ---
  { t: "1弦ホリゾンタル上昇", k: "横", d: "1弦だけでネックを駆け上がる。横移動の入口。", seq: n(0, 5, 8, 10, 12, 15) },
  { t: "2弦ロングライン", k: "横", d: "2弦一本で低音から高音へ。歌うようにレガートで。", seq: n(1, 3, 5, 8, 10, 13, 15) },
  {
    t: "3+2 ホリゾンタル（上昇）", k: "横",
    d: "2弦に3音・1弦に2音。繰り返しながらポジションを上げていく定番の形。",
    seq: [...n(1, 5, 8, 10), ...n(0, 5, 8), ...n(1, 10, 13, 15), ...n(0, 10, 12), ...n(1, 15), ...n(0, 15)],
  },
  {
    t: "3+2 ホリゾンタル（下降）", k: "横",
    d: "同じ形を逆走。上昇より難しいので分けて練習する。",
    seq: [...n(0, 15), ...n(1, 15), ...n(0, 12, 10), ...n(1, 13, 10), ...n(0, 8, 5), ...n(1, 8, 5)],
  },
  {
    t: "2弦↔1弦 ジグザグ", k: "横",
    d: "2本の弦を行き来しながら少しずつ上がる。単調にならない横移動。",
    seq: [{ s: 1, f: 10 }, { s: 0, f: 8 }, { s: 1, f: 13 }, { s: 0, f: 10 }, { s: 1, f: 15 }, { s: 0, f: 12 }, { s: 0, f: 15 }],
  },
  {
    t: "オクターブ・ジャンプ", k: "横",
    d: "低音と高音を交互に。ポジションが飛ぶので指板の全体像が掴める。",
    seq: [{ s: 3, f: 7 }, { s: 0, f: 5 }, { s: 3, f: 12 }, { s: 0, f: 10 }, { s: 3, f: 14 }, { s: 0, f: 12 }],
  },
  { t: "6弦ルートライン", k: "横", d: "低音弦の横移動。そのままリフに使える。", seq: n(5, 3, 5, 8, 10, 12, 15) },
  {
    t: "ロング下降ライン", k: "横",
    d: "1弦と2弦を交互に踏みながらハイポジから一気に降りる。",
    seq: [
      { s: 0, f: 15 }, { s: 1, f: 15 }, { s: 0, f: 12 }, { s: 1, f: 13 },
      { s: 0, f: 10 }, { s: 1, f: 10 }, { s: 0, f: 8 }, { s: 1, f: 8 },
      { s: 0, f: 5 }, { s: 1, f: 5 },
    ],
  },
  // --- 縦（ボックス） ---
  {
    t: "ボックス1 上昇", k: "縦",
    d: "最も基本のポジション。6弦から1弦へ縦に上がる。まずこれを完全に覚える。",
    seq: [...n(5, 5, 8), ...n(4, 5, 7), ...n(3, 5, 7), ...n(2, 5, 7), ...n(1, 5, 8), ...n(0, 5, 8)],
  },
  {
    t: "ボックス1 下降", k: "縦",
    d: "同じ形を1弦から降りる。フレーズの終わりに繋げやすい。",
    seq: [...n(0, 8, 5), ...n(1, 8, 5), ...n(2, 7, 5), ...n(3, 7, 5), ...n(4, 7, 5), ...n(5, 8, 5)],
  },
  {
    t: "ボックス2 上昇", k: "縦",
    d: "ボックス1の隣。ここが弾けると使えるポジションが倍になる。",
    seq: [...n(5, 8, 10), ...n(4, 7, 10), ...n(3, 7, 10), ...n(2, 7, 9), ...n(1, 8, 10), ...n(0, 8, 10)],
  },
  {
    t: "ボックス3 上昇", k: "縦",
    d: "中〜高音のポジション。バッキングに埋もれず抜けてくる帯域。",
    seq: [...n(5, 10, 12), ...n(4, 10, 12), ...n(3, 10, 12), ...n(2, 9, 12), ...n(1, 10, 13), ...n(0, 10, 12)],
  },
  {
    t: "ボックス4 上昇", k: "縦",
    d: "ハイポジションのボックス。ソロの山場で使う。",
    seq: [...n(5, 12, 15), ...n(4, 12, 15), ...n(3, 12, 14), ...n(2, 12, 14), ...n(1, 13, 15), ...n(0, 12, 15)],
  },
  {
    t: "ボックス内ロールバック", k: "縦",
    d: "3音進んで1音戻る反復。縦の動きに推進力が出る。",
    seq: [...n(5, 5, 8), ...n(4, 5), ...n(4, 5, 7), ...n(3, 5), ...n(3, 5, 7), ...n(2, 5), ...n(2, 5, 7), ...n(1, 5)],
  },
  // --- 複合 ---
  {
    t: "複合：ボックス1→スライド→ボックス2", k: "複合",
    d: "縦に上がってから5弦のスライドで隣のボックスへ移り、また縦に上がる。横移動の実戦形。",
    seq: [...n(5, 5, 8), ...n(4, 5, 7), { s: 4, f: 10 }, ...n(3, 7, 10), ...n(2, 7, 9), ...n(1, 8, 10), ...n(0, 8, 10)],
  },
  {
    t: "複合：縦に上って横で駆け上がる", k: "複合",
    d: "ボックスで高音弦まで上がり、そのまま1弦を横に走る。一番よく使う組み合わせ。",
    seq: [...n(5, 5, 8), ...n(4, 5, 7), ...n(3, 5, 7), ...n(2, 5, 7), ...n(1, 5, 8), ...n(0, 5, 8, 10, 12, 15)],
  },
  {
    t: "複合：斜め上昇（2音ずつ弦移動）", k: "複合",
    d: "縦と横を同時に消化する斜めの動き。ジャズ／フュージョン寄りの響き。",
    seq: [...n(3, 5, 7), ...n(2, 5, 7), ...n(3, 10, 12), ...n(2, 9, 12), ...n(3, 14), ...n(2, 14)],
  },
  {
    t: "複合：3ポジションのコール&レスポンス", k: "複合",
    d: "同じ形を3か所で繰り返す。歌心のあるアドリブの基本パターン。",
    seq: [
      { s: 1, f: 5 }, { s: 0, f: 5 }, { s: 0, f: 8 },
      { s: 1, f: 10 }, { s: 0, f: 10 }, { s: 0, f: 12 },
      { s: 1, f: 13 }, { s: 0, f: 12 }, { s: 0, f: 15 },
    ],
  },
];

const MAJOR_LICKS = [
  { t: "1弦ホリゾンタル上昇", k: "横", d: "メジャーペンタの横ラン。明るい響きを耳に入れる。", seq: n(0, 3, 5, 7, 10, 12, 15) },
  {
    t: "3+2 ホリゾンタル（動画の形）", k: "横",
    d: "2弦に3音・1弦に2音を繰り返して上がる。メジャーペンタ横移動の核。",
    seq: [...n(1, 3, 5, 8), ...n(0, 3, 5), ...n(1, 8, 10, 12), ...n(0, 7, 10), ...n(1, 12, 15), ...n(0, 12, 15)],
  },
  {
    t: "3+2（下降）", k: "横",
    d: "同じ形を逆から。ここまで出来るとネック全体が繋がる。",
    seq: [...n(0, 15, 12), ...n(1, 15, 12, 10), ...n(0, 10, 7), ...n(1, 8, 5, 3), ...n(0, 5, 3)],
  },
  { t: "2弦ロングライン", k: "横", d: "2弦一本で歌わせる。ボーカルラインを意識して。", seq: n(1, 3, 5, 8, 10, 12, 15) },
  {
    t: "2弦↔1弦 ジグザグ", k: "横",
    d: "2本を行き来しながら上る。跳ねたリズムで弾くとカントリー風に。",
    seq: [{ s: 1, f: 5 }, { s: 0, f: 3 }, { s: 1, f: 8 }, { s: 0, f: 5 }, { s: 1, f: 10 }, { s: 0, f: 7 }, { s: 1, f: 12 }, { s: 0, f: 10 }],
  },
  { t: "6弦ルートライン", k: "横", d: "低音でのメジャーペンタ。イントロのリフに。", seq: n(5, 3, 5, 7, 10, 12, 15) },
  {
    t: "ボックス1 上昇", k: "縦",
    d: "メジャーペンタの基本ポジション。ルートは6弦にある。",
    seq: [...n(5, 3, 5), ...n(4, 5, 7), ...n(3, 5, 7), ...n(2, 4, 7), ...n(1, 5, 8), ...n(0, 3, 5)],
  },
  {
    t: "ボックス1 下降", k: "縦",
    d: "同じ形を1弦から。締めのフレーズに繋げやすい。",
    seq: [...n(0, 5, 3), ...n(1, 8, 5), ...n(2, 7, 4), ...n(3, 7, 5), ...n(4, 7, 5), ...n(5, 5, 3)],
  },
  {
    t: "ボックス2 上昇", k: "縦",
    d: "隣のポジション。ボックス1と行き来できると一気に自由になる。",
    seq: [...n(5, 7, 10), ...n(4, 7, 10), ...n(3, 7, 9), ...n(2, 7, 9), ...n(1, 8, 10), ...n(0, 7, 10)],
  },
  {
    t: "ボックス3 上昇", k: "縦",
    d: "中〜高音のポジション。抜けの良い帯域。",
    seq: [...n(5, 10, 12), ...n(4, 10, 12), ...n(3, 9, 12), ...n(2, 9, 12), ...n(1, 10, 12), ...n(0, 10, 12)],
  },
  {
    t: "複合：ボックス1→スライド→ボックス2", k: "複合",
    d: "縦に上がってスライドで隣へ移り、また縦に上がる。実戦の基本形。",
    seq: [...n(5, 3, 5), ...n(4, 5, 7), { s: 4, f: 10 }, ...n(3, 7, 9), ...n(2, 7, 9), ...n(1, 8, 10), ...n(0, 7, 10)],
  },
  {
    t: "複合：縦に上って横で駆け上がる", k: "複合",
    d: "ボックスで1弦まで上がり、そのまま横に走り抜ける。",
    seq: [...n(5, 3, 5), ...n(4, 5, 7), ...n(3, 5, 7), ...n(2, 4, 7), ...n(1, 5, 8), ...n(0, 7, 10, 12, 15)],
  },
];

/* --- メロディック（歌もの）フレーズ：音の長さと休符つき --- */

const MINOR_MELODIC = [
  {
    t: "泣きのモチーフ", k: "歌",
    d: "高音から降りてきて長く伸ばす。溜めが命なので、伸ばす音は指を離さずビブラートを。",
    seq: [{ s: 0, f: 8 }, h(0, 5, 2), { s: 1, f: 8 }, h(1, 5, 2), R(), { s: 2, f: 7 }, { s: 2, f: 5 }, h(3, 7, 3)],
  },
  {
    t: "アーチ型メロディ", k: "歌",
    d: "上って下りる山なりの形。ソロの序盤に置くと展開が作りやすい。",
    seq: [{ s: 3, f: 7 }, { s: 2, f: 5 }, { s: 2, f: 7 }, { s: 1, f: 5 }, h(1, 8, 2), { s: 1, f: 5 }, { s: 2, f: 7 }, { s: 2, f: 5 }, h(3, 7, 3)],
  },
  {
    t: "モチーフ反復（3段上げ）", k: "歌",
    d: "同じリズムの型を高さだけ変えて3回。歌メロの作り方そのもの。",
    seq: [{ s: 1, f: 5 }, { s: 1, f: 8 }, h(0, 5, 2), R(), { s: 1, f: 8 }, { s: 1, f: 10 }, h(0, 8, 2), R(), { s: 1, f: 10 }, { s: 1, f: 13 }, h(0, 10, 3)],
  },
  {
    t: "コール&レスポンス（歌）", k: "歌",
    d: "問いかけと答え。間（休符）を怖がらないのがメロディアスに聴こえるコツ。",
    seq: [{ s: 1, f: 8 }, { s: 0, f: 5 }, h(0, 8, 2), R(), { s: 1, f: 10 }, { s: 0, f: 8 }, h(0, 10, 2), R(), { s: 1, f: 13 }, { s: 0, f: 10 }, h(0, 12, 4)],
  },
  {
    t: "ブルージーな溜め", k: "歌",
    d: "頭で長く伸ばしてから一気に降りる。チョーキングを混ぜると本物の響きに。",
    seq: [h(1, 8, 2), { s: 1, f: 10 }, h(0, 5, 2), R(), { s: 1, f: 8 }, { s: 2, f: 7 }, h(2, 5, 4)],
  },
  {
    t: "ハイポジの歌メロ", k: "歌",
    d: "一番おいしい高音域。ソロのクライマックスにそのまま使える。",
    seq: [h(0, 15, 2), { s: 0, f: 12 }, { s: 1, f: 15 }, h(0, 12, 2), { s: 1, f: 13 }, { s: 1, f: 10 }, h(0, 10, 4)],
  },
  {
    t: "低音弦の歌メロ", k: "歌",
    d: "太い低音で歌わせる。バッキングの隙間に置くと格好いい。",
    seq: [h(5, 5, 2), { s: 5, f: 8 }, { s: 4, f: 5 }, h(4, 7, 2), { s: 5, f: 8 }, h(5, 5, 4)],
  },
  {
    t: "オクターブで歌う", k: "歌",
    d: "同じ音を1オクターブ上で言い直す。ドラマチックに聴こえる定番の手。",
    seq: [h(3, 7, 2), h(0, 5, 2), { s: 3, f: 10 }, { s: 3, f: 12 }, { s: 0, f: 8 }, h(0, 10, 3), R(), h(0, 5, 2)],
  },
  {
    t: "4弦から1弦へ昇るメロディ", k: "歌",
    d: "低音から高音へ切れ目なく登っていく。息の長いフレーズの練習に。",
    seq: [{ s: 3, f: 7 }, { s: 3, f: 10 }, { s: 2, f: 7 }, { s: 2, f: 9 }, { s: 1, f: 8 }, { s: 1, f: 10 }, { s: 0, f: 8 }, h(0, 10, 4)],
  },
  {
    t: "終止感のあるフレーズ", k: "歌",
    d: "ハイポジから降りてきてルートで着地。ソロの締めに。",
    seq: [{ s: 0, f: 12 }, { s: 0, f: 10 }, { s: 1, f: 13 }, { s: 1, f: 10 }, { s: 1, f: 8 }, h(0, 5, 2), { s: 1, f: 8 }, { s: 1, f: 5 }, { s: 2, f: 7 }, h(3, 7, 4)],
  },
  {
    t: "モチーフ発展（3ポジション）", k: "歌",
    d: "2音のモチーフを、ポジションを上げながら育てていく。",
    seq: [{ s: 2, f: 5 }, { s: 2, f: 7 }, h(1, 5, 2), { s: 2, f: 7 }, { s: 2, f: 9 }, h(1, 8, 2), { s: 1, f: 10 }, { s: 1, f: 13 }, h(0, 10, 4)],
  },
  {
    t: "静かな入りのバラード", k: "歌",
    d: "少ない音数で長く伸ばす。速く弾かないほうが気持ちいいことを体で覚える。",
    seq: [h(1, 5, 3), R(), h(1, 8, 3), R(), h(0, 5, 4), { s: 1, f: 8 }, h(1, 5, 4)],
  },
];

const MAJOR_MELODIC = [
  {
    t: "明るいアーチ", k: "歌",
    d: "山なりに上って下りる。メジャーペンタの気持ちよさが一番出る形。",
    seq: [{ s: 3, f: 5 }, { s: 2, f: 4 }, { s: 2, f: 7 }, { s: 1, f: 5 }, h(1, 8, 2), { s: 1, f: 5 }, { s: 2, f: 7 }, { s: 2, f: 4 }, h(3, 5, 3)],
  },
  {
    t: "カントリー歌メロ", k: "歌",
    d: "跳ねたリズムで。休符を挟むと一気にカントリーらしくなる。",
    seq: [{ s: 1, f: 8 }, { s: 0, f: 3 }, h(0, 5, 2), R(), { s: 1, f: 10 }, { s: 0, f: 5 }, h(0, 7, 2), R(), { s: 0, f: 10 }, h(0, 12, 3)],
  },
  {
    t: "ソウルフルなモチーフ", k: "歌",
    d: "伸ばす音を主役に。ゆっくり弾くほど味が出る。",
    seq: [h(1, 5, 2), { s: 1, f: 8 }, h(0, 3, 2), R(), { s: 1, f: 8 }, { s: 2, f: 7 }, h(2, 4, 4)],
  },
  {
    t: "跳ねる3度スキップ", k: "歌",
    d: "1音飛ばしで拾う動き。単調なランから抜け出す常套句。",
    seq: [{ s: 2, f: 4 }, { s: 1, f: 5 }, { s: 2, f: 7 }, { s: 1, f: 8 }, { s: 1, f: 5 }, { s: 0, f: 3 }, { s: 1, f: 8 }, h(0, 5, 3)],
  },
  {
    t: "ハイポジの歌", k: "歌",
    d: "高音で伸ばして落とす。サビ裏のオブリガートにも。",
    seq: [h(0, 15, 2), { s: 0, f: 12 }, { s: 1, f: 15 }, h(0, 12, 2), { s: 1, f: 12 }, { s: 1, f: 10 }, h(0, 10, 4)],
  },
  {
    t: "低音のメロディ", k: "歌",
    d: "6弦・5弦で歌わせる。イントロやAメロの裏に。",
    seq: [h(5, 3, 2), { s: 5, f: 5 }, { s: 4, f: 5 }, h(4, 7, 2), { s: 5, f: 7 }, { s: 5, f: 5 }, h(5, 3, 4)],
  },
  {
    t: "オクターブ・メロディ", k: "歌",
    d: "同じフレーズをオクターブ上で言い直す。明るさが2倍になる。",
    seq: [h(3, 5, 2), h(0, 3, 2), { s: 3, f: 9 }, { s: 3, f: 12 }, { s: 0, f: 7 }, h(0, 10, 3), R(), h(0, 3, 2)],
  },
  {
    t: "終止フレーズ", k: "歌",
    d: "高音から降りてルートに着地。曲の終わりにそのまま使える。",
    seq: [{ s: 0, f: 12 }, { s: 0, f: 10 }, { s: 1, f: 12 }, { s: 1, f: 10 }, { s: 1, f: 8 }, h(0, 5, 2), { s: 1, f: 8 }, { s: 1, f: 5 }, { s: 2, f: 7 }, h(3, 5, 4)],
  },
];

/* --- ブルーノートを使ったジャジーなフレーズ --- */
// マイナーの♭5、メジャーの♭3が「ブルーノート」。経過音として素早く通すのがコツ。

const MINOR_BLUE = [
  {
    t: "王道の 4→♭5→5", k: "Blue",
    d: "ブルーノートの基本形。♭5は止まらず素通りして5度に着地させる。",
    seq: [{ s: 2, f: 5 }, { s: 2, f: 8 }, h(2, 9, 2), { s: 1, f: 5 }, h(1, 8, 2), R(), { s: 2, f: 7 }, h(2, 5, 2)],
  },
  {
    t: "♭5を挟んで駆け上がる", k: "Blue",
    d: "上昇ラインの途中に♭5を1音だけ差し込む。ジャズブルースの常套句。",
    seq: [{ s: 3, f: 5 }, { s: 3, f: 7 }, { s: 2, f: 5 }, { s: 2, f: 8 }, { s: 2, f: 9 }, { s: 1, f: 5 }, { s: 1, f: 8 }, h(0, 5, 3)],
  },
  {
    t: "ジャジーな下降", k: "Blue",
    d: "高音から♭5を通って降りてくる。半音の動きが一気に大人っぽくする。",
    seq: [h(0, 12, 2), { s: 0, f: 11 }, { s: 0, f: 10 }, { s: 1, f: 13 }, { s: 1, f: 10 }, { s: 1, f: 8 }, h(0, 5, 3)],
  },
  {
    t: "4-♭5-5 の反復モチーフ", k: "Blue",
    d: "同じ3音の型を3か所で。ポジションが変わっても指の形は同じ。",
    seq: [{ s: 1, f: 3 }, { s: 1, f: 4 }, h(1, 5, 2), R(), { s: 0, f: 10 }, { s: 0, f: 11 }, h(0, 12, 2), R(), { s: 2, f: 5 }, { s: 2, f: 8 }, h(2, 9, 3)],
  },
  {
    t: "低音のブルーノート・リフ", k: "Blue",
    d: "6弦だけで完結するリフ。バッキングとしてもそのまま使える。",
    seq: [h(5, 5, 2), { s: 5, f: 8 }, { s: 5, f: 10 }, { s: 5, f: 11 }, h(5, 12, 2), { s: 5, f: 10 }, h(5, 5, 2)],
  },
  {
    t: "ジャズブルースの締め", k: "Blue",
    d: "ハイポジから♭5を経由してルートへ着地。ソロの終わりに。",
    seq: [{ s: 0, f: 15 }, { s: 0, f: 12 }, { s: 1, f: 15 }, { s: 1, f: 13 }, { s: 0, f: 11 }, h(0, 10, 2), { s: 1, f: 10 }, { s: 1, f: 8 }, { s: 2, f: 7 }, h(3, 7, 4)],
  },
];

const MAJOR_BLUE = [
  {
    t: "王道の 2→♭3→3", k: "Blue",
    d: "メジャーのブルーノートは♭3。長3度に半音で滑り込ませるのが決め手。",
    seq: [{ s: 1, f: 10 }, { s: 1, f: 11 }, h(1, 12, 2), R(), { s: 0, f: 5 }, { s: 0, f: 6 }, h(0, 7, 3)],
  },
  {
    t: "♭3を挟んで駆け上がる", k: "Blue",
    d: "4弦の半音の動きから高音へ。カントリーもジャズもこの形。",
    seq: [{ s: 3, f: 5 }, { s: 3, f: 7 }, { s: 3, f: 8 }, { s: 3, f: 9 }, { s: 2, f: 7 }, { s: 1, f: 8 }, { s: 1, f: 10 }, h(0, 7, 3)],
  },
  {
    t: "明るいブルーノート・モチーフ", k: "Blue",
    d: "伸ばす音と半音の動きの組み合わせ。ソウルっぽい色気が出る。",
    seq: [h(1, 10, 2), { s: 1, f: 11 }, { s: 1, f: 12 }, { s: 0, f: 7 }, h(0, 10, 2), R(), { s: 1, f: 12 }, { s: 1, f: 10 }, h(1, 8, 3)],
  },
  {
    t: "スウィングする終止", k: "Blue",
    d: "降りながら♭3を通ってルートへ。跳ねたリズムで弾くとジャズらしい。",
    seq: [{ s: 0, f: 12 }, { s: 0, f: 10 }, { s: 1, f: 12 }, { s: 1, f: 11 }, { s: 1, f: 10 }, h(0, 7, 2), { s: 1, f: 8 }, { s: 2, f: 7 }, { s: 2, f: 4 }, h(3, 5, 4)],
  },
];

const SCALES = {
  minorPenta: {
    key: "minorPenta",
    label: "マイナーペンタ",
    intervals: [0, 3, 5, 7, 10],
    degrees: ["1", "♭3", "4", "5", "♭7"],
    blue: 6, blueLabel: "♭5",
    accent: "#E0603C",
    baseRoot: 9,
    licks: [...MINOR_LICKS, ...MINOR_MELODIC, ...MINOR_BLUE],
    chords: [
      { off: 0, q: "m7", tag: "トニック" },
      { off: 0, q: "7", tag: "ブルース Ⅰ7" },
      { off: 5, q: "7", tag: "ブルース Ⅳ7" },
    ],
    songs: [
      { t: "丸の内サディスティック / 丸サ進行", n: "Ⅵm7（Am7）区間でAマイナーペンタ。原曲キーE♭ならCマイナーペンタ。" },
      { t: "Hotel California / Eagles", n: "Bマイナーペンタの泣きのソロ。" },
      { t: "Highway to Hell / AC/DC", n: "Aマイナーペンタのロックリフ。" },
    ],
  },
  majorPenta: {
    key: "majorPenta",
    label: "メジャーペンタ",
    intervals: [0, 2, 4, 7, 9],
    degrees: ["1", "2", "3", "5", "6"],
    blue: 3, blueLabel: "♭3",
    accent: "#3E9CC9",
    baseRoot: 7,
    licks: [...MAJOR_LICKS, ...MAJOR_MELODIC, ...MAJOR_BLUE],
    chords: [
      { off: 0, q: "maj7", tag: "トニック" },
      { off: 0, q: "6", tag: "トニック 6th" },
      { off: 9, q: "m7", tag: "平行調 Ⅵm7" },
    ],
    songs: [
      { t: "G–D–C–G 進行", n: "王道スリーコード。Gメジャーペンタが全編で使える。" },
      { t: "Sweet Home Alabama / Lynyrd Skynyrd", n: "Dメジャーペンタのカントリーロック。" },
      { t: "My Girl / The Temptations", n: "メジャーペンタの代表的イントロ。" },
    ],
  },
};

const CHORD_IV = { m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], "6": [0, 4, 7, 9] };
const SUFFIX = { m7: "m7", "7": "7", maj7: "M7", "6": "6" };

/* ============================= バッキング ============================= */
// コード進行そのものに著作権はないので、進行だけを使い、音はすべてこのアプリ内で合成しています。

const CH = {
  G:   { b: "G1",  n: ["G2", "B2", "D3", "G3"] },
  D:   { b: "D2",  n: ["D3", "F#3", "A3", "D4"] },
  C:   { b: "C2",  n: ["C3", "E3", "G3", "C4"] },
  Am7: { b: "A1",  n: ["A2", "E3", "G3", "C4"] },
  A7:  { b: "A1",  n: ["A2", "E3", "G3", "C#4"] },
  D7:  { b: "D2",  n: ["D3", "A3", "C4", "F#4"] },
  E7:  { b: "E1",  n: ["E2", "B2", "D3", "G#3"] },
  FM7: { b: "F1",  n: ["F2", "C3", "E3", "A3"] },
  CM7: { b: "C2",  n: ["C3", "G3", "B3", "E4"] },
  Em7: { b: "E1",  n: ["E2", "B2", "D3", "G3"] },
};

const BACKINGS = [
  { id: "gdcg", name: "G – D – C – G", hint: "王道スリーコード", bpm: 92, style: "rock", bars: ["G", "D", "C", "G"], scale: "majorPenta", root: 7 },
  { id: "amvamp", name: "Am7 ヴァンプ", hint: "1コードで延々ソロ練習", bpm: 88, style: "funk", bars: ["Am7", "Am7", "Am7", "Am7"], scale: "minorPenta", root: 9 },
  { id: "blues", name: "A ブルース 12小節", hint: "定番の12小節進行", bpm: 96, style: "shuffle", bars: ["A7", "D7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"], scale: "minorPenta", root: 9 },
  { id: "marusa", name: "丸サ進行", hint: "FM7–E7–Am7–CM7", bpm: 100, style: "funk", bars: ["FM7", "E7", "Am7", "CM7"], scale: "minorPenta", root: 9 },
  { id: "marusaB", name: "丸サ Bメロ進行", hint: "FM7–G–CM7–Em7", bpm: 100, style: "funk", bars: ["FM7", "G", "CM7", "Em7"], scale: "majorPenta", root: 0 },
];

/* ============================= 計算 ============================= */

const noteName = (i) => NOTE_NAMES[((i % 12) + 12) % 12];
const degIndexAt = (open, fret, root, iv) => iv.indexOf((((open + fret) % 12) - root + 12) % 12);
const freqOf = (s, f) => 440 * Math.pow(2, (STRINGS[s].midi + f - 69) / 12);

// その音の度数ラベル（ブルーノートも含む）
function degLabel(scale, root, s, f) {
  const semis = (((STRINGS[s].open + f) % 12) - root + 12) % 12;
  const di = scale.intervals.indexOf(semis);
  if (di >= 0) return { label: scale.degrees[di], blue: false };
  if (semis === scale.blue) return { label: scale.blueLabel, blue: true };
  return { label: "?", blue: false };
}

function transposeLick(seq, baseRoot, root) {
  let shift = (((root - baseRoot) % 12) + 12) % 12;
  const frets = seq.filter((x) => !x.r).map((x) => x.f);
  if (Math.max(...frets) + shift > NUM_FRETS) shift -= 12;
  if (Math.min(...frets) + shift < 0) shift += 12;
  return seq.map((x) => (x.r ? x : { ...x, f: x.f + shift }));
}

// 8分音符グリッドに展開（h=伸ばす長さ、r=休符）
function buildGrid(seq) {
  const g = [];
  seq.forEach((it, i) => {
    if (it.r) {
      for (let k = 0; k < it.r; k++) g.push(null);
      return;
    }
    const len = it.h || 1;
    g.push({ i, note: it, attack: true, len });
    for (let k = 1; k < len; k++) g.push({ i, note: it, attack: false, len });
  });
  return g;
}

/* ============================= 本体 ============================= */

export default function PentatonicTrainer() {
  const [scaleKey, setScaleKey] = useState("minorPenta");
  const [root, setRoot] = useState(9);
  const [tab, setTab] = useState("licks");
  const [selected, setSelected] = useState(0);
  const [lickOn, setLickOn] = useState(false);
  const [step, setStep] = useState(-1);
  const [loop, setLoop] = useState(true);
  const [bpm, setBpm] = useState(90);
  const [backingId, setBackingId] = useState(null);
  const [curChord, setCurChord] = useState("");
  const [landscape, setLandscape] = useState(false);
  const [showBlue, setShowBlue] = useState(true);

  const scale = SCALES[scaleKey];
  const licks = useMemo(
    () => scale.licks.map((l) => ({ ...l, seq: transposeLick(l.seq, scale.baseRoot, root) })),
    [scaleKey, root]
  );
  const current = licks[Math.min(selected, licks.length - 1)];

  /* --- オーディオ --- */
  const inst = useRef({});
  const engine = useRef({ timer: null, nextTime: 0, step: 0 });
  const st = useRef({ backing: null, lick: null, lickPos: 0, loop: true, bpm: 90, pending: false });

  useEffect(() => {
    st.current.loop = loop;
  }, [loop]);
  useEffect(() => {
    st.current.bpm = bpm;
  }, [bpm]);
  useEffect(() => {
    st.current.lick = lickOn ? buildGrid(current.seq) : null;
  }, [current, lickOn]);

  useEffect(() => {
    // --- ギターらしい音作り ---
    const rev = new Tone.Reverb({ decay: 2.2, wet: 0.18 }).toDestination();

    // リード：軽く歪ませたシングルコイル風
    const leadCab = new Tone.Filter({ frequency: 3400, type: "lowpass", rolloff: -24 }).connect(rev);
    const leadDrive = new Tone.Distortion({ distortion: 0.32, wet: 0.55 }).connect(leadCab);
    inst.current.leadCab = leadCab;
    inst.current.leadDrive = leadDrive;
    inst.current.lead = new Tone.FMSynth({
      harmonicity: 2,
      modulationIndex: 6,
      oscillator: { type: "sine" },
      envelope: { attack: 0.008, decay: 1.4, sustain: 0.3, release: 0.9 },
      modulation: { type: "sine" },
      modulationEnvelope: { attack: 0.004, decay: 0.4, sustain: 0.04, release: 0.3 },
      volume: -7,
    }).connect(leadDrive);

    // バッキングギター：クリーンな爪弾き
    const gtrCab = new Tone.Filter({ frequency: 2800, type: "lowpass", rolloff: -12 }).connect(rev);
    const gtrHi = new Tone.Filter({ frequency: 160, type: "highpass" }).connect(gtrCab);
    inst.current.gtrCab = gtrCab;
    inst.current.gtrHi = gtrHi;
    inst.current.gtr = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 3.5,
      oscillator: { type: "sine" },
      envelope: { attack: 0.004, decay: 1.1, sustain: 0.04, release: 0.7 },
      modulation: { type: "sine" },
      modulationEnvelope: { attack: 0.003, decay: 0.25, sustain: 0, release: 0.2 },
      volume: -21,
    }).connect(gtrHi);

    // ベース
    const bassTone = new Tone.Filter({ frequency: 900, type: "lowpass" }).toDestination();
    inst.current.bassTone = bassTone;
    inst.current.bass = new Tone.FMSynth({
      harmonicity: 1,
      modulationIndex: 2.5,
      oscillator: { type: "sine" },
      envelope: { attack: 0.012, decay: 0.7, sustain: 0.25, release: 0.3 },
      modulationEnvelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.2 },
      volume: -8,
    }).connect(bassTone);

    inst.current.kick = new Tone.MembraneSynth({ octaves: 5, pitchDecay: 0.05, volume: -9 }).toDestination();
    inst.current.snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
      volume: -19,
    }).toDestination();
    const hatFilter = new Tone.Filter(7000, "highpass").toDestination();
    inst.current.hatFilter = hatFilter;
    inst.current.hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
      volume: -30,
    }).connect(hatFilter);
    inst.current.rev = rev;
    return () => {
      if (engine.current.timer) clearInterval(engine.current.timer);
      Object.values(inst.current).forEach((i) => i?.dispose?.());
    };
  }, []);

  /* --- スケジューラ（8分音符グリッド） --- */
  const scheduleStep = useCallback((i, time) => {
    const s = st.current;
    const I = inst.current;
    const pos = i % 8; // 小節内の8分位置

    if (s.backing) {
      const b = s.backing;
      const barIdx = Math.floor(i / 8) % b.bars.length;
      const ch = CH[b.bars[barIdx]];
      if (pos === 0) {
        const name = b.bars[barIdx];
        const d = Math.max(0, (time - Tone.now()) * 1000);
        setTimeout(() => setCurChord(name), d);
      }
      // ドラム
      if (b.style === "shuffle") {
        if (pos === 0 || pos === 5) I.kick.triggerAttackRelease("C1", "8n", time);
        if (pos === 2 || pos === 6) I.snare.triggerAttackRelease("8n", time);
        I.hat.triggerAttackRelease("16n", time, pos % 2 === 0 ? 0.9 : 0.45);
      } else if (b.style === "funk") {
        if (pos === 0 || pos === 3 || pos === 6) I.kick.triggerAttackRelease("C1", "8n", time);
        if (pos === 2 || pos === 6) I.snare.triggerAttackRelease("8n", time);
        I.hat.triggerAttackRelease("16n", time, pos % 2 === 0 ? 0.85 : 0.5);
      } else {
        if (pos === 0 || pos === 4) I.kick.triggerAttackRelease("C1", "8n", time);
        if (pos === 2 || pos === 6) I.snare.triggerAttackRelease("8n", time);
        I.hat.triggerAttackRelease("16n", time, pos % 2 === 0 ? 0.9 : 0.5);
      }
      // ベース
      if (pos === 0) I.bass.triggerAttackRelease(ch.b, "4n", time);
      else if (pos === 4) I.bass.triggerAttackRelease(ch.b, "8n", time);
      else if (pos === 7 && b.style !== "rock") I.bass.triggerAttackRelease(ch.b, "16n", time, 0.6);
      // ギター・コンピング（ストローク）
      const strum = (t, vel) =>
        ch.n.forEach((nt, k) => I.gtr.triggerAttackRelease(nt, "8n", t + k * 0.014, vel));
      if (b.style === "funk") {
        if (pos === 0) strum(time, 0.8);
        if (pos === 3) strum(time, 0.55);
        if (pos === 6) strum(time, 0.7);
      } else if (b.style === "shuffle") {
        if (pos === 0) strum(time, 0.75);
        if (pos === 4) strum(time, 0.6);
      } else {
        if (pos === 0) strum(time, 0.8);
        if (pos === 2) strum(time, 0.45);
        if (pos === 4) strum(time, 0.65);
        if (pos === 6) strum(time, 0.45);
      }
    }

    // リード（フレーズ）— 小節頭から走らせるのでバッキングと自然に合う
    if (s.pending && pos === 0) {
      s.pending = false;
      s.lickPos = 0;
    }
    if (!s.pending && s.lick) {
      const grid = s.lick;
      const padded = Math.ceil(grid.length / 8) * 8;
      const p = s.lickPos;
      const cell = p < grid.length ? grid[p] : null;
      const d = Math.max(0, (time - Tone.now()) * 1000);
      if (cell && cell.attack) {
        const dur = Math.max(0.08, cell.len * (30 / s.bpm) * 0.92);
        I.lead.triggerAttackRelease(freqOf(cell.note.s, cell.note.f), dur, time);
        setTimeout(() => setStep(cell.i), d);
      } else if (!cell) {
        setTimeout(() => setStep(-1), d);
      }
      s.lickPos = p + 1;
      if (s.lickPos >= padded) {
        if (s.loop) s.lickPos = 0;
        else {
          s.lick = null;
          setTimeout(() => { setLickOn(false); setStep(-1); }, 0);
        }
      }
    }
  }, []);

  const tick = useCallback(() => {
    const e = engine.current;
    const dur = 30 / st.current.bpm;
    const now = Tone.now();
    while (e.nextTime < now + 0.25) {
      if (e.nextTime < now) e.nextTime = now + 0.02;
      scheduleStep(e.step, e.nextTime);
      e.step += 1;
      e.nextTime += dur;
    }
  }, [scheduleStep]);

  const ensureEngine = useCallback(async () => {
    await Tone.start();
    if (Tone.getContext && Tone.getContext().state !== "running") await Tone.getContext().resume?.();
    const e = engine.current;
    if (e.timer) return false;
    e.step = 0;
    e.nextTime = Tone.now() + 0.15;
    e.timer = setInterval(tick, 25);
    return true;
  }, [tick]);

  const maybeStopEngine = useCallback(() => {
    const s = st.current;
    if (!s.backing && !s.lick && engine.current.timer) {
      clearInterval(engine.current.timer);
      engine.current.timer = null;
      setCurChord("");
    }
  }, []);

  async function toggleBacking(b) {
    if (backingId === b.id) {
      st.current.backing = null;
      setBackingId(null);
      setCurChord("");
      maybeStopEngine();
      return;
    }
    setBackingId(b.id);
    setScaleKey(b.scale);
    setRoot(b.root);
    setSelected(0);
    setBpm(b.bpm);
    st.current.bpm = b.bpm;
    st.current.backing = b;
    const fresh = await ensureEngine();
    if (!fresh) engine.current.step = 0; // 小節頭から
  }

  async function toggleLick() {
    if (lickOn) {
      st.current.lick = null;
      st.current.pending = false;
      setLickOn(false);
      setStep(-1);
      maybeStopEngine();
      return;
    }
    st.current.lick = buildGrid(current.seq);
    st.current.lickPos = 0;
    st.current.pending = !!st.current.backing; // バッキング中は次の小節頭から
    setLickOn(true);
    await ensureEngine();
  }

  useEffect(() => {
    // フレーズやキーを変えたら止める
    st.current.lick = null;
    setLickOn(false);
    setStep(-1);
  }, [selected, scaleKey, root]);

  async function playNote(s, f) {
    await Tone.start();
    inst.current.lead.triggerAttackRelease(freqOf(s, f), "8n");
  }

  /* --- 画面の向き --- */
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const on = () => setLandscape(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const cell = landscape ? 38 : 42;
  const rowH = landscape ? 24 : 30;
  const labelW = 28;
  const boardW = labelW + cell * (NUM_FRETS + 1);
  const boardH = rowH * 6 + 32;

  /* --- 指板スクロール：はみ出す時だけ動かす --- */
  const boardScroll = useRef(null);
  const activeItem = lickOn && step >= 0 ? current.seq[step] : null;
  const active = activeItem && !activeItem.r ? activeItem : null;

  useEffect(() => {
    const el = boardScroll.current;
    if (!el || !active) return;
    const x = labelW + cell * active.f + cell / 2;
    const pad = cell * 1.2;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    if (x < left + pad) el.scrollTo({ left: Math.max(0, x - pad - cell), behavior: "smooth" });
    else if (x > right - pad) el.scrollTo({ left: x - el.clientWidth + pad + cell, behavior: "smooth" });
  }, [active, cell]);

  useEffect(() => {
    const el = boardScroll.current;
    if (!el || !current) return;
    const fr = current.seq.filter((x) => !x.r).map((x) => x.f);
    const minF = Math.min(...fr);
    const maxF = Math.max(...fr);
    const centerX = labelW + cell * ((minF + maxF) / 2) + cell / 2;
    const target = Math.max(0, Math.min(centerX - el.clientWidth / 2, boardW - el.clientWidth));
    el.scrollTo({ left: target, behavior: "smooth" });
  }, [selected, scaleKey, root, cell, boardW]);

  const backing = BACKINGS.find((b) => b.id === backingId);

  return (
    <div style={{ height: "100dvh", background: "#17150F", color: "#F2ECE2", fontFamily: "'Inter',-apple-system,sans-serif", overflow: "hidden" }}>
      <style>{CSS}</style>

      <div className={landscape ? "wrap land" : "wrap"}>
        <div className="fixedTop">
          <div className="topRow">
            <div className="brand">
              <span className="disp">Pentatonic</span>
              <span className="mono sm dim">SCALE TRAINER</span>
            </div>
            <div className="scaleTabs">
              {Object.values(SCALES).map((s) => (
                <button
                  key={s.key}
                  onClick={() => { setScaleKey(s.key); setSelected(0); }}
                  className="sTab"
                  style={{
                    borderColor: s.key === scaleKey ? s.accent : "#33302C",
                    background: s.key === scaleKey ? "#262320" : "transparent",
                    color: s.key === scaleKey ? "#F2ECE2" : "#8C8377",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rootRow">
            <span className="mono sm dim">ROOT</span>
            {NOTE_NAMES.map((nm, i) => (
              <button
                key={nm}
                onClick={() => setRoot(i)}
                className="rootBtn mono"
                style={{
                  background: i === root ? scale.accent : "transparent",
                  color: i === root ? "#17150F" : "#9A9184",
                  borderColor: i === root ? scale.accent : "#33302C",
                }}
              >
                {nm}
              </button>
            ))}
          </div>

          <div className="legendRow">
            <span className="lg"><i style={{ background: "#E5A93F" }} />ルート</span>
            <span className="lg"><i style={{ background: scale.accent }} />構成音</span>
            <button
              onClick={() => setShowBlue((b) => !b)}
              className="blueToggle"
              style={{
                background: showBlue ? "#8E6FD0" : "transparent",
                color: showBlue ? "#FFFDF8" : "#8C8377",
                borderColor: showBlue ? "#8E6FD0" : "#4A4038",
              }}
            >
              <i style={{ background: showBlue ? "#FFFDF8" : "#8E6FD0" }} />
              ブルーノート {scale.blueLabel} {showBlue ? "ON" : "OFF"}
            </button>
          </div>

          <div className="boardScroll" ref={boardScroll}>
            <Fretboard
              scale={scale} root={root} lick={current} active={active} showBlue={showBlue}
              cell={cell} rowH={rowH} labelW={labelW} w={boardW} h={boardH} onNote={playNote}
            />
          </div>

          <div className="statusRow">
            <div className="lickTitle">
              <span className="kchip" style={{ borderColor: scale.accent, color: scale.accent }}>{current?.k}</span>
              <span className="disp">{current?.t}</span>
              <span className="mono sm dim"> {selected + 1}/{licks.length}</span>
            </div>
            <div className="ctrls">
              <button className="icoBtn" onClick={() => setLoop((l) => !l)}
                style={{ color: loop ? scale.accent : "#8C8377", borderColor: loop ? scale.accent : "#33302C" }}>
                <Repeat size={13} />
              </button>
              <button className="playBtn" onClick={toggleLick} style={{ background: lickOn ? "#8E3B27" : scale.accent }}>
                {lickOn ? <Square size={13} /> : <Play size={13} />}
                {lickOn ? "停止" : "フレーズ"}
              </button>
            </div>
          </div>

          {backing && (
            <div className="backBar" style={{ borderColor: scale.accent + "55" }}>
              <Music2 size={12} style={{ color: scale.accent }} />
              <span className="mono sm">{backing.name}</span>
              <span className="mono sm" style={{ color: scale.accent }}>{curChord}</span>
              <button className="stopMini" onClick={() => toggleBacking(backing)}>停止</button>
            </div>
          )}
        </div>

        <div className="scrollArea">
          <div className="tabs">
            {[["licks", `フレーズ ${licks.length}`], ["backing", "バッキング"], ["ref", "コード・曲"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="tabBtn"
                style={{ color: tab === k ? "#F2ECE2" : "#7E766B", borderBottomColor: tab === k ? scale.accent : "transparent" }}>
                {l}
              </button>
            ))}
          </div>

          {tab === "licks" && (
            <div className="list">
              <p className="note">横＝ネックを移動する動き、縦＝ポジション内（ボックス）の動き、複合＝その組み合わせ。バッキング再生中にフレーズを再生すると、次の小節頭から合わせて鳴ります。</p>
              {licks.map((l, i) => (
                <button key={i} onClick={() => setSelected(i)} className="lickCard"
                  style={{ borderColor: i === selected ? scale.accent : "#2C2924", background: i === selected ? "#252118" : "#1E1C18" }}>
                  <div className="lickHead">
                    <span className="mono num" style={{ color: scale.accent }}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="kchip" style={{ borderColor: "#3D382F", color: "#948B7E" }}>{l.k}</span>
                    <span className="lickName">{l.t}</span>
                  </div>
                  <div className="lickDesc">{l.d}</div>
                  <div className="mono lickTab">
                    {l.seq.filter((x) => !x.r).map((x, j, arr) => {
                      const dg = degLabel(scale, root, x.s, x.f);
                      return (
                        <span key={j} style={{ color: dg.blue ? "#A98BE0" : undefined }}>
                          {dg.label}{j < arr.length - 1 ? " → " : ""}
                        </span>
                      );
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "backing" && (
            <div className="list">
              <p className="note">ドラム・ベース・コードをアプリ内で合成しています。ループ再生しながら上のフレーズを重ねてください。</p>
              {BACKINGS.map((b) => (
                <div key={b.id} className="backCard" style={{ borderColor: backingId === b.id ? scale.accent : "#2C2924" }}>
                  <div>
                    <div className="lickName">{b.name}</div>
                    <div className="lickDesc">{b.hint} ・ {b.bpm} BPM ・ {b.bars.length}小節</div>
                  </div>
                  <button className="playBtn" onClick={() => toggleBacking(b)}
                    style={{ background: backingId === b.id ? "#8E3B27" : scale.accent }}>
                    {backingId === b.id ? <Square size={13} /> : <Play size={13} />}
                    {backingId === b.id ? "停止" : "再生"}
                  </button>
                </div>
              ))}
              <div className="bpmRow">
                <span className="mono sm dim">TEMPO</span>
                <input type="range" min="60" max="140" value={bpm} onChange={(e) => setBpm(+e.target.value)} style={{ accentColor: scale.accent, flex: 1 }} />
                <span className="mono sm">{bpm}</span>
              </div>
            </div>
          )}

          {tab === "ref" && (
            <div className="list">
              <div className="secTitle disp">使えるコード</div>
              <div className="chordGrid">
                {scale.chords.map((c, i) => (
                  <div key={i} className="chordCard">
                    <div className="disp chordName" style={{ color: scale.accent }}>{noteName(root + c.off) + SUFFIX[c.q]}</div>
                    <div className="lickDesc">{c.tag}</div>
                    <div className="mono sm dim">{CHORD_IV[c.q].map((iv) => noteName(root + c.off + iv)).join(" ")}</div>
                  </div>
                ))}
              </div>
              <div className="secTitle disp">代表的な曲</div>
              {scale.songs.map((s, i) => (
                <div key={i} className="songCard">
                  <div className="lickName">{s.t}</div>
                  <div className="lickDesc">{s.n}</div>
                </div>
              ))}
              <div className="secTitle disp">見方</div>
              <div className="songCard">
                <div className="lickDesc">
                  金色＝ルート（1度）。{scale.label}の構成音は {scale.degrees.join(" / ")}。
                  紫＝ブルーノート（{scale.blueLabel}）で、スケール外の経過音です。止まらず素早く通り抜けるとジャジーに、
                  伸ばすと外れて聴こえます。上の「Blue」ボタンで表示を切り替えられます。
                  選択中フレーズの音だけ濃く表示され、点線がその移動経路です。丸をタップすると単音が鳴ります。
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================= 指板 ============================= */

const BLUE_COLOR = "#8E6FD0";

function Fretboard({ scale, root, lick, active, cell, rowH, labelW, w, h, showBlue, onNote }) {
  const top = 10;
  const x = (f) => labelW + cell * f + cell / 2;
  const y = (s) => top + s * rowH;

  const lickSet = useMemo(() => {
    const set = new Set();
    lick?.seq.forEach((p) => { if (!p.r) set.add(`${p.s}-${p.f}`); });
    return set;
  }, [lick]);

  const points = lick?.seq.filter((p) => !p.r).map((p) => `${x(p.f)},${y(p.s)}`).join(" ");

  const dots = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= NUM_FRETS; f++) {
      const semis = (((STRINGS[s].open + f) % 12) - root + 12) % 12;
      const di = scale.intervals.indexOf(semis);
      const isBlue = di < 0 && semis === scale.blue;
      if (di < 0 && !isBlue) continue;
      const inLick = lickSet.has(`${s}-${f}`);
      if (isBlue && !showBlue && !inLick) continue;
      const isRoot = di === 0;
      const isActive = active && active.s === s && active.f === f;
      dots.push(
        <g key={`${s}-${f}`} onClick={() => onNote(s, f)} style={{ cursor: "pointer" }} opacity={inLick ? 1 : isBlue ? 0.32 : 0.2}>
          <circle cx={x(f)} cy={y(s)} r={isActive ? 13 : isBlue ? 10 : 11}
            fill={isBlue ? BLUE_COLOR : isRoot ? "#E5A93F" : scale.accent}
            stroke={isActive ? "#FFFFFF" : "rgba(12,9,5,0.55)"} strokeWidth={isActive ? 2.6 : 1.4} />
          <text x={x(f)} y={y(s) + 4.2} textAnchor="middle" fontSize={isBlue ? "11" : "12"} fontWeight="700"
            fill="#FFFDF8" stroke="rgba(20,15,8,0.65)" strokeWidth="2.2" paintOrder="stroke"
            fontFamily="'IBM Plex Mono',monospace" style={{ pointerEvents: "none" }}>
            {isBlue ? scale.blueLabel : scale.degrees[di]}
          </text>
        </g>
      );
    }
  }

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <rect x={labelW} y={0} width={w - labelW} height={rowH * 6 + 4} fill="#3B2A1C" rx="4" />
      {SINGLE_MARKERS.map((f) => <circle key={f} cx={x(f)} cy={top + rowH * 2.5} r="3.2" fill="rgba(240,235,225,0.15)" />)}
      {DOUBLE_MARKERS.map((f) => (
        <g key={f}>
          <circle cx={x(f)} cy={top + rowH * 1.5} r="3.2" fill="rgba(240,235,225,0.15)" />
          <circle cx={x(f)} cy={top + rowH * 3.5} r="3.2" fill="rgba(240,235,225,0.15)" />
        </g>
      ))}
      {Array.from({ length: NUM_FRETS + 1 }).map((_, f) => (
        <line key={f} x1={labelW + cell * (f + 1)} y1={2} x2={labelW + cell * (f + 1)} y2={rowH * 6 + 2}
          stroke="rgba(210,205,195,0.35)" strokeWidth="1" />
      ))}
      <line x1={labelW + 1} y1={2} x2={labelW + 1} y2={rowH * 6 + 2} stroke="#EFE7D8" strokeWidth="3" />
      {STRINGS.map((s, i) => (
        <g key={s.num}>
          <line x1={labelW} y1={y(i)} x2={w} y2={y(i)} stroke="#8E7A5C" strokeWidth={0.7 + i * 0.3} />
          <text x={labelW - 6} y={y(i) + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="#B5AA99" fontFamily="'IBM Plex Mono',monospace">{s.num}</text>
        </g>
      ))}
      {points && <polyline points={points} fill="none" stroke={scale.accent} strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="4 3" />}
      {dots}
      {Array.from({ length: NUM_FRETS + 1 }).map((_, f) => (
        <text key={f} x={x(f)} y={rowH * 6 + 22} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#9A9184" fontFamily="'IBM Plex Mono',monospace">{f}</text>
      ))}
    </svg>
  );
}

/* ============================= スタイル ============================= */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap');
*{box-sizing:border-box;}
.disp{font-family:'Fraunces',serif;font-weight:700;}
.mono{font-family:'IBM Plex Mono',monospace;}
.sm{font-size:10px;letter-spacing:.06em;}
.dim{color:#7E766B;}
.wrap{height:100dvh;display:flex;flex-direction:column;}
.fixedTop{flex:0 0 auto;background:#17150F;border-bottom:1px solid #2C2924;padding:8px 10px 6px;}
.scrollArea{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 10px 30px;}
.topRow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;}
.brand{display:flex;align-items:baseline;gap:6px;}
.brand .disp{font-size:16px;letter-spacing:-.01em;}
.scaleTabs{display:flex;gap:5px;}
.sTab{border:1px solid;border-radius:14px;padding:4px 10px;font-size:11.5px;cursor:pointer;white-space:nowrap;}
.rootRow{display:flex;align-items:center;gap:3px;margin-bottom:7px;overflow-x:auto;}
.legendRow{display:flex;align-items:center;gap:10px;margin-bottom:5px;}
.lg{display:flex;align-items:center;gap:4px;font-size:10.5px;color:#948B7E;}
.lg i,.blueToggle i{width:9px;height:9px;border-radius:50%;display:inline-block;flex:0 0 auto;}
.blueToggle{display:flex;align-items:center;gap:5px;margin-left:auto;border:1px solid;border-radius:14px;padding:4px 11px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;}
.rootBtn{border:1px solid;border-radius:6px;padding:3px 0;width:26px;flex:0 0 26px;font-size:10.5px;font-weight:600;cursor:pointer;}
.boardScroll{overflow-x:auto;-webkit-overflow-scrolling:touch;background:#1B1913;border-radius:6px;}
.statusRow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;}
.lickTitle{display:flex;align-items:center;gap:6px;min-width:0;}
.lickTitle .disp{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.kchip{border:1px solid;border-radius:4px;padding:1px 5px;font-size:9.5px;flex:0 0 auto;}
.ctrls{display:flex;gap:6px;align-items:center;flex:0 0 auto;}
.icoBtn{background:transparent;border:1px solid;border-radius:7px;padding:5px 7px;cursor:pointer;display:flex;}
.playBtn{display:flex;align-items:center;gap:5px;border:none;border-radius:16px;padding:6px 13px;font-size:12px;font-weight:600;color:#17150F;cursor:pointer;white-space:nowrap;}
.backBar{display:flex;align-items:center;gap:8px;margin-top:6px;border:1px solid;border-radius:8px;padding:4px 10px;}
.stopMini{margin-left:auto;background:transparent;border:none;color:#B5AA99;font-size:11px;cursor:pointer;text-decoration:underline;}
.tabs{display:flex;gap:14px;position:sticky;top:0;background:#17150F;padding:8px 0 0;z-index:2;}
.tabBtn{background:none;border:none;border-bottom:2px solid;padding:5px 2px 7px;font-size:13px;font-weight:600;cursor:pointer;}
.list{display:flex;flex-direction:column;gap:7px;padding-top:8px;}
.lickCard{border:1px solid;border-radius:9px;padding:9px 11px;text-align:left;cursor:pointer;color:inherit;}
.lickHead{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.num{font-size:11px;font-weight:600;}
.lickName{font-size:13.5px;font-weight:600;}
.lickDesc{font-size:11.5px;color:#948B7E;line-height:1.55;margin-top:3px;}
.lickTab{font-size:10px;color:#6F675C;margin-top:6px;word-break:break-word;line-height:1.6;}
.backCard{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid;border-radius:9px;padding:10px 12px;background:#1E1C18;}
.bpmRow{display:flex;align-items:center;gap:10px;padding:8px 2px;}
.note{font-size:11.5px;color:#948B7E;line-height:1.6;margin:0 0 4px;}
.secTitle{font-size:14px;margin:10px 0 2px;}
.chordGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:7px;}
.chordCard,.songCard{background:#1E1C18;border:1px solid #2C2924;border-radius:9px;padding:9px 11px;}
.chordName{font-size:18px;}
.wrap.land .fixedTop{padding:5px 10px 4px;}
.wrap.land .brand .disp{font-size:14px;}
.wrap.land .rootRow{margin-bottom:5px;}
.wrap.land .statusRow{margin-top:5px;}
.wrap.land .brand .sm{display:none;}
button{font-family:inherit;}
::-webkit-scrollbar{height:6px;width:6px;}
::-webkit-scrollbar-thumb{background:#3D382F;border-radius:3px;}
`;
