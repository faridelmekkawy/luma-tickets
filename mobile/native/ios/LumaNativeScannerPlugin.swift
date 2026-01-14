import Capacitor
import AVFoundation
import UIKit

@objc(LumaNativeScannerPlugin)
public class LumaNativeScannerPlugin: CAPPlugin {
    private let eventName = "scan"
    private weak var scannerController: LumaScannerViewController?

    @objc func startScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.presentScanner(call: call)
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.dismissScanner()
            call.resolve()
        }
    }

    private func presentScanner(call: CAPPluginCall) {
        if scannerController != nil {
            call.resolve()
            return
        }

        let status = AVCaptureDevice.authorizationStatus(for: .video)
        if status == .denied || status == .restricted {
            call.reject("Camera permission denied")
            return
        }

        AVCaptureDevice.requestAccess(for: .video) { granted in
            if !granted {
                call.reject("Camera permission denied")
                return
            }
            DispatchQueue.main.async {
                guard let parent = self.bridge?.viewController else {
                    call.reject("Unable to access view controller")
                    return
                }
                let controller = LumaScannerViewController()
                controller.modalPresentationStyle = .fullScreen
                controller.onScan = { [weak self] value, type in
                    guard let self = self else { return }
                    let payload: [String: Any] = ["value": value, "type": type]
                    self.notifyListeners(self.eventName, data: payload)
                    self.dismissScanner()
                }
                controller.onCancel = { [weak self] in
                    self?.dismissScanner()
                }
                self.scannerController = controller
                parent.present(controller, animated: true) {
                    call.resolve()
                }
            }
        }
    }

    private func dismissScanner() {
        scannerController?.dismiss(animated: true)
        scannerController = nil
    }
}

final class LumaScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((String, String) -> Void)?
    var onCancel: (() -> Void)?

    private let session = AVCaptureSession()
    private let previewLayer = AVCaptureVideoPreviewLayer()
    private let overlayView = UIView()
    private let closeButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupPreview()
        setupOverlay()
        configureSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
        overlayView.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if !session.isRunning {
            session.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            session.stopRunning()
        }
    }

    private func setupPreview() {
        previewLayer.session = session
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
    }

    private func setupOverlay() {
        overlayView.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        view.addSubview(overlayView)

        let frameView = UIView()
        frameView.layer.borderColor = UIColor.white.withAlphaComponent(0.8).cgColor
        frameView.layer.borderWidth = 2
        frameView.layer.cornerRadius = 18
        frameView.translatesAutoresizingMaskIntoConstraints = false
        overlayView.addSubview(frameView)

        closeButton.setTitle("Close", for: .normal)
        closeButton.setTitleColor(.white, for: .normal)
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.6)
        closeButton.layer.cornerRadius = 14
        closeButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 16, bottom: 10, right: 16)
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        overlayView.addSubview(closeButton)

        NSLayoutConstraint.activate([
            frameView.centerXAnchor.constraint(equalTo: overlayView.centerXAnchor),
            frameView.centerYAnchor.constraint(equalTo: overlayView.centerYAnchor),
            frameView.widthAnchor.constraint(equalTo: overlayView.widthAnchor, multiplier: 0.7),
            frameView.heightAnchor.constraint(equalTo: frameView.widthAnchor),

            closeButton.leadingAnchor.constraint(equalTo: overlayView.leadingAnchor, constant: 20),
            closeButton.topAnchor.constraint(equalTo: overlayView.safeAreaLayoutGuide.topAnchor, constant: 20)
        ])
    }

    @objc private func closeTapped() {
        onCancel?()
    }

    private func configureSession() {
        guard let device = AVCaptureDevice.default(for: .video) else {
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: device)
            if session.canAddInput(input) {
                session.addInput(input)
            }

            let output = AVCaptureMetadataOutput()
            if session.canAddOutput(output) {
                session.addOutput(output)
            }
            output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            output.metadataObjectTypes = [.qr, .ean8, .ean13, .pdf417, .code128]
        } catch {
            return
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let value = metadataObject.stringValue else {
            return
        }
        let type = metadataObject.type.rawValue
        onScan?(value, type)
    }
}
