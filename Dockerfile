FROM stefanscherer/node-windows:8.9.1-windowsservercore

ADD https://www.python.org/ftp/python/2.7.14/python-2.7.14.msi /temp/python.msi
RUN msiexec.exe /i "/temp/python.msi" /qn

RUN mkdir %USERPROFILE%\shippable\reqproc
WORKDIR %USERPROFILE%\shippable\reqproc
ADD . .
RUN dir
RUN npm install

RUN mkdir %USERPROFILE%\shippable\execTemplates
WORKDIR %USERPROFILE%\shippable\execTemplates
RUN ..\shippable\reqproc\windows\utils\wget https://github.com/Shippable/execTemplates/archive/master.tar.gz -O %TMP%\execTemplates.tar.gz && \
    ..\shippable\reqproc\windows\utils\gzip -d  %TMP%\execTemplates.tar.gz && \
    copy %TMP%\execTemplates.tar . && \
    ..\shippable\reqproc\windows\utils\tar xvf execTemplates.tar && \
    del %TMP%\execTemplates.tar.gz

RUN mkdir %USERPROFILE%\shippable\reqexec
WORKDIR %USERPROFILE%\shippable\reqexec
COPY .\windows\reqexec\bin\main.exe .

CMD %USERPROFILE%\shippable\reqproc\boot.bat
