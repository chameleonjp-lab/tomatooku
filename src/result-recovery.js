// Text-only history view. Restoring/displaying a record never sends it.
export function createRecoveryView({host,document=globalThis.document,outbox,submit,t,formatTime}) {
  let revision=0;
  async function refresh() {
    const mine=++revision;
    const {records,quarantined,unavailable}=await outbox.list();
    if(mine!==revision)return;
    host.replaceChildren();
    for(const {record,persisted} of records.sort((a,b)=>b.record.snapshot.completedAt-a.record.snapshot.completedAt)) {
      const box=document.createElement('article');box.className='saved-result';
      const score=document.createElement('p');score.textContent=t('保存した結果: {time}秒',{time:formatTime(record.snapshot.display.score)});
      const details=document.createElement('p');details.textContent=t('誤タップ{mistakes} / ヒント{hints}',{mistakes:record.snapshot.display.mistakes,hints:record.snapshot.display.hints});
      const status=document.createElement('p');status.setAttribute?.('role','status');
      const accepted=record.state==='accepted';
      status.textContent=t(persisted?'この端末に保存済み':'端末保存を確認できません。この画面を閉じると失う可能性があります。')+' '+
        t(accepted?(record.receipt?.underReview?'記録を受け付けました（確認中）':'記録を受け付けました'):record.state==='sending'?'別の送信が進行中です。少し待って再試行してください。':'受領を確認できません。結果は保持しています。');
      const elapsed=document.createElement('p');elapsed.textContent=t('実時間')+': '+t('{time}秒',{time:formatTime(Math.floor(record.snapshot.display.elapsedMs/10))});
      box.append(score,elapsed,details,status);
      const d=record.snapshot.display;
      if(Array.isArray(d.stageTimesMs))for(let i=0;i<d.stageTimesMs.length;i++){
        const stage=document.createElement('p');stage.textContent=t('ステージ{stage}: {time} / 誤{mistakes} / ヒント{hints}',
          {stage:i+1,time:t('{time}秒',{time:formatTime(Math.floor(d.stageTimesMs[i]/10))}),mistakes:d.stageMistakeCounts?.[i]??0,hints:d.stageHintCounts?.[i]??0});box.append(stage);
      }
      if(!accepted){
        const retry=document.createElement('button');retry.type='button';retry.className='btn secondary';retry.textContent=t('同じ結果を再送');
        retry.onclick=async()=>{
          retry.disabled=true;status.textContent=t('公式ランキングへ送信中…');
          try {const answer=await outbox.attempt(record.id,submit);
            if(answer.error==='busy')status.textContent=t('別の送信が進行中です。少し待って再試行してください。');
          } finally {await refresh();}
        };
        box.append(retry);
      }
      host.append(box);
    }
    if(quarantined){const p=document.createElement('p');p.textContent=t('読み取れない保存結果があります。上書きせず保留しています。');host.append(p);}
    if(unavailable&&!records.length){const p=document.createElement('p');p.textContent=t('端末保存を確認できません。この画面を閉じると失う可能性があります。');host.append(p);}
  }
  return {refresh};
}
