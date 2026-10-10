// Bounded intent matching: user text selects known aggregate operations, never a query.
const rate=value=>`${Number(value).toFixed(1)}%`
export function answerAdminFact(question,facts) {
  const q=question.toLowerCase();const prefix='Based on the current PlacementHub data, '
  if(/\b(?:why|how|recommend|suggest|focus|improve)\b/.test(q)&&!/how many/.test(q))return null
  if(/branch/.test(q)&&/placement rate|placed percentage/.test(q)&&/lowest|highest|weakest|strongest/.test(q)){
    const rows=facts.branches.filter(row=>row.eligibleStudents>0);const low=/lowest|weakest/.test(q);const target=rows.length?(low?Math.min:Math.max)(...rows.map(row=>row.eligiblePlacementRate)):null
    const ties=rows.filter(row=>row.eligiblePlacementRate===target)
    return {answer:ties.length?prefix+`${ties.slice(0,5).map(row=>row.branch).join(', ')} ${ties.length>1?'tie for':'has'} the ${low?'lowest':'highest'} eligible placement rate at ${rate(target)}.${ties.length>5?` Showing 5 of ${ties.length} tied branches.`:''} Denominator: college-eligible students; confirmed placements only.`:prefix+'no branch has an eligible denominator for this comparison.',evidenceRefs:['branches']}
  }
  if(/compan/.test(q)&&/most|highest|strongest|best/.test(q)&&/hir|placed|placement|offer/.test(q)){
    const max=Math.max(0,...facts.companies.map(row=>row.confirmedPlacements));const rows=facts.companies.filter(row=>row.confirmedPlacements===max)
    return {answer:max?prefix+`${rows.slice(0,5).map(row=>row.name).join(', ')} ${rows.length>1?'tie with':'has'} ${max} confirmed placement records.${rows.length>5?` Showing 5 of ${rows.length} ties.`:''} This counts offers, not unique hired students.`:prefix+'no confirmed Company placement records are documented yet.',evidenceRefs:['companies']}
  }
  if(/drive/.test(q)&&/conversion|applications|applicants/.test(q)&&/strongest|highest|lowest|fewest|most|best/.test(q)){
    const conversion=/conversion/.test(q);const rows=facts.drives.filter(row=>!conversion||row.applicants>0);const key=conversion?'confirmedOfferConversion':'applicants';const low=/lowest|fewest/.test(q);const value=rows.length?(low?Math.min:Math.max)(...rows.map(row=>row[key])):null
    const tied=rows.filter(row=>row[key]===value)
    return {answer:tied.length?prefix+`${tied.slice(0,5).map(row=>`${row.role} (${row.id})`).join(', ')} ${tied.length>1?'tie at':'has'} ${conversion?rate(value)+' confirmed-offer/application conversion':value+' applications'}.${tied.length>5?` Showing 5 of ${tied.length} ties.`:''} Active drives may have incomplete outcomes; small cohorts require caution.`:prefix+'insufficient drive applications for conversion comparison.',evidenceRefs:['drives']}
  }
  if(/funnel|drop.?off|bottleneck/.test(q)&&!/focus|recommend|improv|why|how/.test(q)){
    const rows=facts.drives.flatMap(drive=>drive.phases.filter(phase=>phase.entered>0).map(phase=>({drive,phase,exits:phase.rejected+phase.absent+phase.withdrawn}))).sort((a,b)=>b.exits-a.exits)
    const top=rows[0]
    return {answer:top?.exits?prefix+`${top.drive.role}, ${top.phase.label}, has the largest recorded phase exits: ${top.exits} (${top.phase.rejected} rejected, ${top.phase.absent} absent, ${top.phase.withdrawn} withdrawn). This is recorded exits, not inferred sequential conversion; phases differ by drive.`:prefix+'no recorded rejected/absent/withdrawn phase exits are documented. Current-phase snapshots cannot establish a reliable drop-off.',evidenceRefs:['phaseHistories']}
  }
  if(/how many|count|number/.test(q)&&/unplaced/.test(q))return {answer:prefix+`${facts.summary.unplacedEligibleStudents} college-eligible students remain without a confirmed placement.`,evidenceRefs:['summary']}
  if(/skills/.test(q)&&/demanded|common|most/.test(q)){const rows=/demand/.test(q)?facts.demandedSkills:facts.skills;return {answer:prefix+(rows.length?rows.slice(0,5).map(row=>`${row.skill}: ${row.drives??row.applicants} ${row.drives!==undefined?'drives':'applicants'}`).join('; '):'no reliable structured skill counts are documented.')+' These are documented tags, not proof of proficiency.',evidenceRefs:['skills']}}
  return null
}
