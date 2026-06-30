/**
 * トマトク ステージバンク (自動生成: scripts/generate_stages.js)
 *
 * 各ステージは 5x5。regions は 5 行の文字列で、A〜E の 5 エリアを表す。
 * 各エリアはちょうど 5 マス。solution は正解の🍅配置 [row, col] x5。
 * すべて一意解であることを scripts/verify_stages.js で検証済み。
 *
 * difficulty: 1=やさしい / 2=ふつう / 3=むずかしい (各10問)
 *
 * 手で編集しないこと。再生成は npm run gen を参照。
 */
export const STAGES = [
  { id: "T001", difficulty: 1, regions: ["BBAAA","CBBBA","CCCCA","EDDDD","EEEED"], solution: [[0,4],[1,2],[2,0],[3,3],[4,1]] },
  { id: "T002", difficulty: 1, regions: ["AAABB","ABBBC","ACCCC","DDDDE","DEEEE"], solution: [[0,0],[1,2],[2,4],[3,1],[4,3]] },
  { id: "T003", difficulty: 1, regions: ["AAABB","ABBBC","ADCCC","DDDCE","DEEEE"], solution: [[0,0],[1,2],[2,4],[3,1],[4,3]] },
  { id: "T004", difficulty: 1, regions: ["BBAAA","CBBBA","CCCDA","ECDDD","EEEED"], solution: [[0,4],[1,2],[2,0],[3,3],[4,1]] },
  { id: "T005", difficulty: 1, regions: ["BBAAA","CBBBA","CCDDA","ECCDD","EEEED"], solution: [[0,4],[1,2],[2,0],[3,3],[4,1]] },
  { id: "T006", difficulty: 1, regions: ["CBAAA","CBBBA","CCDBA","ECDDD","EEEED"], solution: [[0,4],[1,2],[2,0],[3,3],[4,1]] },
  { id: "T007", difficulty: 1, regions: ["AAABC","ABBBC","ABDCC","DDDCE","DEEEE"], solution: [[0,0],[1,2],[2,4],[3,1],[4,3]] },
  { id: "T008", difficulty: 1, regions: ["AAABB","ABBBC","ADDCC","DDCCE","DEEEE"], solution: [[0,0],[1,2],[2,4],[3,1],[4,3]] },
  { id: "T009", difficulty: 1, regions: ["BAAAA","BCCDA","BBCDD","EBCCD","EEEED"], solution: [[0,3],[1,0],[2,2],[3,4],[4,1]] },
  { id: "T010", difficulty: 1, regions: ["AAAAB","ADCCB","DDCBB","DCCBE","DEEEE"], solution: [[0,1],[1,4],[2,2],[3,0],[4,3]] },
  { id: "T011", difficulty: 2, regions: ["BAAAA","BBCCA","EBBCC","EDDDC","EEEDD"], solution: [[0,3],[1,1],[2,4],[3,2],[4,0]] },
  { id: "T012", difficulty: 2, regions: ["AAABB","ACCBD","ACBBD","CCEED","EEEDD"], solution: [[0,0],[1,3],[2,1],[3,4],[4,2]] },
  { id: "T013", difficulty: 2, regions: ["AAAAB","ACCBB","CCBBE","CDDDE","DDEEE"], solution: [[0,1],[1,3],[2,0],[3,2],[4,4]] },
  { id: "T014", difficulty: 2, regions: ["BBAAC","BAACC","BDACE","BDDCE","DDEEE"], solution: [[0,2],[1,0],[2,3],[3,1],[4,4]] },
  { id: "T015", difficulty: 2, regions: ["AAABB","ACBBD","ACEBD","CCEED","CEEDD"], solution: [[0,0],[1,3],[2,1],[3,4],[4,2]] },
  { id: "T016", difficulty: 2, regions: ["AAAAB","ACBBB","CCBDE","CDDDE","CDEEE"], solution: [[0,1],[1,3],[2,0],[3,2],[4,4]] },
  { id: "T017", difficulty: 2, regions: ["BAAAA","BBBCA","EDBCC","EDDDC","EEEDC"], solution: [[0,3],[1,1],[2,4],[3,2],[4,0]] },
  { id: "T018", difficulty: 2, regions: ["BBAAA","DBBCA","DBECA","DEECC","DDEEC"], solution: [[0,4],[1,1],[2,3],[3,0],[4,2]] },
  { id: "T019", difficulty: 2, regions: ["BBAAA","BAACD","BCCCD","BCEED","EEEDD"], solution: [[0,3],[1,0],[2,2],[3,4],[4,1]] },
  { id: "T020", difficulty: 2, regions: ["AAABB","ACBBD","ACBED","CCEED","CEEDD"], solution: [[0,0],[1,3],[2,1],[3,4],[4,2]] },
  { id: "T021", difficulty: 3, regions: ["BBAAC","BAACC","BADCE","BDDCE","DDEEE"], solution: [[0,2],[1,0],[2,3],[3,1],[4,4]] },
  { id: "T022", difficulty: 3, regions: ["BAAAA","BBBCA","EBCCC","EDDDC","EEEDD"], solution: [[0,3],[1,1],[2,4],[3,2],[4,0]] },
  { id: "T023", difficulty: 3, regions: ["CAABB","CCAAB","ECDAB","ECDDB","EEEDD"], solution: [[0,2],[1,4],[2,1],[3,3],[4,0]] },
  { id: "T024", difficulty: 3, regions: ["BBAAA","BAACC","BDDCE","BDCCE","DDEEE"], solution: [[0,2],[1,0],[2,3],[3,1],[4,4]] },
  { id: "T025", difficulty: 3, regions: ["AAABB","ACEBD","ACEBD","CCEBD","CEEDD"], solution: [[0,0],[1,3],[2,1],[3,4],[4,2]] },
  { id: "T026", difficulty: 3, regions: ["BBAAA","DBECA","DBECA","DBECC","DDEEC"], solution: [[0,4],[1,1],[2,3],[3,0],[4,2]] },
  { id: "T027", difficulty: 3, regions: ["BBAAC","BDACC","BDACE","BDACE","DDEEE"], solution: [[0,2],[1,0],[2,3],[3,1],[4,4]] },
  { id: "T028", difficulty: 3, regions: ["CAABB","CCADB","ECADB","ECADB","EEEDD"], solution: [[0,2],[1,4],[2,1],[3,3],[4,0]] },
  { id: "T029", difficulty: 3, regions: ["AAAAB","ABBBB","CCCCE","CDDDE","DDEEE"], solution: [[0,1],[1,3],[2,0],[3,2],[4,4]] },
  { id: "T030", difficulty: 3, regions: ["BAAAA","BBBBA","ECCCC","EDDDC","EEEDD"], solution: [[0,3],[1,1],[2,4],[3,2],[4,0]] }
];

export default STAGES;
