"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),{spawnSync}=require("node:child_process");
test("PowerPoint inventory and target lookup traverse native groups and fail closed on invalid trees",()=>{
 const modulePath=path.resolve("scripts/lib/powerpoint-shape-tree.ps1").replaceAll("'","''");
 const script=`$ErrorActionPreference='Stop'; . '${modulePath}'
 function Release-Com($Value) {}
 function Collection($Items) { $v=[pscustomobject]@{Count=$Items.Count;Items=$Items}; $v|Add-Member ScriptMethod Item {param($i) $this.Items[$i-1]}; return $v }
 function Leaf($Id) {return [pscustomobject]@{Id=$Id;Type=1}}
 function MockGroup($Id,$Items) {return [pscustomobject]@{Id=$Id;Type=6;GroupItems=(Collection $Items)}}
 function Check($Ok) {if(-not $Ok){throw 'Regression assertion failed.'}}
 function Reject($Action) {$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Check $failed}
 $tree=Collection @((Leaf 1),(MockGroup 2 @((Leaf 3),(MockGroup 4 @((Leaf 5))))))
 $ids=@(Get-PowerPointShapeTreeIds $tree);Check (($ids -join ',') -eq '1,2,3,4,5')
 Check ((Find-PowerPointShapeInTree $tree 5).Id -eq 5)
 Check ($null -eq (Find-PowerPointShapeInTree $tree 99))
 Check (@(Get-PowerPointShapeTreeIds (Collection @())).Count -eq 0)
 Reject {Get-PowerPointShapeTreeIds (Collection @((Leaf 1),(MockGroup 2 @((Leaf 1)))))}
 Reject {Get-PowerPointShapeTreeIds (Collection @((Leaf 0)))}
 Reject {Get-PowerPointShapeTreeIds (Collection @($null))}
 Reject {Get-PowerPointShapeTreeIds $null}
 Reject {Find-PowerPointShapeInTree $tree 0}
 foreach($invalidCount in @($null,'0',0.5)) {
   Reject {Get-PowerPointShapeTreeIds ([pscustomobject]@{Count=$invalidCount})}
   Reject {Find-PowerPointShapeInTree ([pscustomobject]@{Count=$invalidCount}) 1}
 }
 Reject {Get-PowerPointShapeTreeIds ([pscustomobject]@{Count=100001})}
 Reject {Find-PowerPointShapeInTree ([pscustomobject]@{Count=100001}) 1}
 Reject {Get-PowerPointShapeTreeIds $tree @{Ids=[Collections.Generic.HashSet[int]]::new();Count=99999}}
 Reject {Find-PowerPointShapeInTree $tree 99 0 @{Count=99999}}
 $deep=Leaf 100;for($i=33;$i -ge 1;$i--){$deep=MockGroup $i @($deep)}
 Reject {Get-PowerPointShapeTreeIds (Collection @($deep))}
 Reject {Find-PowerPointShapeInTree (Collection @($deep)) 100}
 'passed'
 `;
 const result=spawnSync(process.platform==="win32"?"powershell.exe":"pwsh",["-NoProfile","-NonInteractive","-Command",script],{encoding:"utf8",timeout:30000,windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/passed/u);
});
