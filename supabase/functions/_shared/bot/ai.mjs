export function applyProposal(s){
 if(!s.proposal||s.proposal.baseRevision!==s.revision)throw Error('تغيرت البيانات. اطلب اقتراحًا جديدًا.');
 for(const r of s.proposal.rewrites){const parts=r.id.split('.');let at=s.data;for(const k of parts.slice(0,-1))at=at[k];at[parts.at(-1)]=r.text;}
 if(s.proposal.kind==='translate')s.data.language=s.proposal.targetLanguage;
 s.revision++;s.confirmedRevision=null;delete s.proposal;
}
