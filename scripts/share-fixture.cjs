// Test-only: the shipped inline compatibility defaults otherwise replace addInitScript state.
function installRankingFixture(windowObject,backend){
 const config=Object.freeze({supabaseUrl:backend,supabasePublishableKey:'sb_publishable_local_fixture_not_a_key',rankingsEnabled:true,submissionsEnabled:false,bestRankingRpc:'get_best_score_ranking'});
 Object.defineProperty(windowObject,'TOMATOKU_CONFIG',{configurable:false,get:()=>config,set:()=>{}});
}
module.exports={installRankingFixture};
