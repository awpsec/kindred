"""Exercise the exact Windows discovery projection with synthetic .NET interfaces.

Run after cold native discovery so this never warms the release acceptance gate.
No network configuration or owner profile is read or changed by these fixtures.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ENUMERATOR = '[System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()'
PREFIX = r'''
$ErrorActionPreference='Stop';
function New-FixtureInterface($name, $description, $status, $addresses) {
    $item = [pscustomobject]@{Name=$name; Id='not-the-saved-alias'; Description=$description; OperationalStatus=[System.Net.NetworkInformation.OperationalStatus]$status; FixtureAddresses=$addresses};
    $item | Add-Member -MemberType ScriptMethod -Name GetIPProperties -Value {
        [pscustomobject]@{UnicastAddresses=@(foreach ($text in $this.FixtureAddresses) {
            [pscustomobject]@{Address=[System.Net.IPAddress]::Parse($text)}
        })}
    } -PassThru
}
'''


def production_script(root):
    source = (root/'desktop/src/network_interfaces.rs').read_text()
    function = source.split('#[cfg(windows)]\npub fn discover_with_diagnostics(', 1)[1]
    script = json.loads(re.search(r'let script = ("(?:[^"\\]|\\.)*");', function).group(1))
    assert script.count(ENUMERATOR) == 1
    return script


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if os.name != 'nt':
        raise SystemExit('Actual Windows PowerShell is required; no simulated pass.')
    script = production_script(args.source)
    cases = [
        ('aliases_addresses_status', r'''$fixture=@(
New-FixtureInterface 'Wi-Fi "Office" café' 'Wireless adapter' 'Up' @('192.168.12.8','fd7a:115c::8','fe80::123%7')
New-FixtureInterface 'Tailscale' 'Tailscale Tunnel' 'Up' @('100.64.1.2')
New-FixtureInterface 'Ethernet unplugged' 'Ethernet adapter' 'Down' @('10.1.2.3')
New-FixtureInterface 'No addresses' 'Virtual adapter' 'Up' @()
New-FixtureInterface 'Loopback Pseudo-Interface 1' 'Loopback' 'Up' @('127.0.0.1','::1')
)''', '@($fixture)', [
            {'id':'Wi-Fi "Office" café','description':'Wireless adapter','up':True,'addresses':['192.168.12.8','fd7a:115c::8','fe80::123']},
            {'id':'Tailscale','description':'Tailscale Tunnel','up':True,'addresses':['100.64.1.2']},
            {'id':'Ethernet unplugged','description':'Ethernet adapter','up':False,'addresses':['10.1.2.3']},
            {'id':'Loopback Pseudo-Interface 1','description':'Loopback','up':True,'addresses':['127.0.0.1','::1']},
        ]),
        ('empty_inventory', '$fixture=@()', '@($fixture)', []),
        ('enumeration_error', "function Read-FailedFixture { throw 'fixture-enumeration-failed' }", '(Read-FailedFixture)', None),
        ('properties_error', "$fixture=New-FixtureInterface 'Failed' 'Failed' 'Up' @('10.1.2.3'); $fixture | Add-Member -Force -MemberType ScriptMethod -Name GetIPProperties -Value { throw 'fixture-properties-failed' }", '@($fixture)', None),
    ]
    receipt = {'passed':False,'source_commit':subprocess.check_output(['git','-C',str(args.source),'rev-parse','HEAD'],text=True).strip(),'script_sha256':hashlib.sha256(script.encode()).hexdigest(),'cases':[],'actual_network_enumerated':False,'owner_state_mutated':False}
    try:
        for name, setup, enumerator, expected in cases:
            command = PREFIX + '\n' + setup + '\n' + script.replace(ENUMERATOR, enumerator)
            started = time.monotonic()
            result = subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',command],capture_output=True,timeout=10)
            if expected is None:
                assert result.returncode != 0, name
                assert not result.stdout.strip(), 'Error must not publish a partial inventory'
            else:
                assert result.returncode == 0, (name,result.stderr.decode(errors='replace'))
                assert json.loads(result.stdout.decode('utf-8-sig')) == expected, name
            receipt['cases'].append({'name':name,'passed':True,'exit_code':result.returncode,'elapsed_seconds':round(time.monotonic()-started,3)})
        receipt['passed'] = True
    finally:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps(receipt))


if __name__ == '__main__':
    main()
