/* Small, server-authoritative national advantages. All playable nations receive
   one trait. Keep the values modest and store them in one auditable table. */
export const NATION_TRAITS=Object.freeze({
  GB:{name:'Royal Navy',description:'Ships cost 8% less',kind:'shipCost',value:0.92},
  ES:{name:'Defensive Positions',description:'Defending ground troops have 8% more effective health',kind:'defenseHealth',value:1.08},
  FR:{name:'Industrial Centres',description:'Bank production is increased by 8%',kind:'bankIncome',value:1.08},
  DE:{name:'Armoured Mobility',description:'Tank-led ground armies travel 6% faster',kind:'tankSpeed',value:0.94},
  SU:{name:'Mass Mobilization',description:'Infantry cost 8% less',kind:'infantryCost',value:0.92},
  RO:{name:'Armour Workshops',description:'Tanks cost 8% less',kind:'tankCost',value:0.92},
  HU:{name:'Infantry Doctrine',description:'Infantry attacks inflict 8% more damage',kind:'infantryDamage',value:1.08},
  IT:{name:'Mediterranean Fleet',description:'Naval attacks inflict 8% more damage',kind:'navalDamage',value:1.08},
  PT:{name:'Atlantic Ports',description:'Naval ports cost 8% less to build',kind:'portCost',value:0.92}
});
export function nationModifier(nation,kind){
  const trait=NATION_TRAITS[nation];
  return trait?.kind===kind?trait.value:1;
}
export function discountedPrice(price,nation,kind){
  return Math.round(price*nationModifier(nation,kind)*100)/100;
}
