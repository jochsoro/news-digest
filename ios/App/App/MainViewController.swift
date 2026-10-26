//
//  MainViewController.swift
//  News Digest
//
//  Sous-classe de CAPBridgeViewController qui enregistre les plugins
//  Capacitor définis dans le target App. Capacitor 8 (SPM) n'auto-découvre
//  que les plugins venant de packages SPM externes, pas le code du target :
//  sans cet enregistrement, le plugin existe mais n'est jamais chargé.
//
//  Instancié par SceneDelegate à la place de CAPBridgeViewController.
//

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        NSLog("[NewsDigest] capacitorDidLoad — enregistrement des plugins du target")
        bridge?.registerPluginInstance(NativeTabBarPlugin())
    }
}
