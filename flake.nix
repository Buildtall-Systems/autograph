{
  description = "autograph — browser extension for sovereign identity: NIP-07 signer, growing into a list-of-lists interface";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            secretspec
            # adb only, for web-ext run --target=firefox-android against an
            # emulator or device. The emulator itself comes from the
            # buildtall-android devShell.
            android-tools
          ];

          shellHook = ''
            export PROJECT_NAME="autograph"
          '';
        };
      }
    );
}
